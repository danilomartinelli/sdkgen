
module Semantic
  class Visitor
    def initialize(@ast : AST::ApiDescription)
    end

    def visit(node : AST::ApiDescription)
      node.type_definitions.each {|e| visit e }
      node.operations.each {|e| visit e }
    end

    def visit(op : AST::Operation)
      op.args.each {|arg| visit arg }
      visit op.return_type
    end

    def visit(field : AST::Field)
      visit field.type
    end

    def visit(definition : AST::TypeDefinition)
      visit definition.type
    end

    def visit(t : AST::StructType)
      t.fields.each {|field| visit field }
    end

    def visit(t : AST::ArrayType)
      visit t.base
    end

    def visit(t : AST::OptionalType)
      visit t.base
    end

    def visit(t : AST::PrimitiveType | AST::EnumType | AST::TypeReference)
    end
  end

  class CheckEveryTypeDefined < Visitor
    def visit(ref : AST::TypeReference)
      definition = @ast.type_definitions.find {|t| t.name == ref.name }
      unless definition
        raise "Could not find type '#{ref.name}'"
      end
      ref.type = definition.type
      super
    end
  end

  class CheckNoRecursiveTypes < Visitor
    @path = [] of String
    @root_type : AST::Type?

    def visit(definition : AST::TypeDefinition)
      @path = [definition.name]
      @root_type = definition.type
      super
      @root_type = nil
    end

    def visit(field : AST::Field)
      @path.push field.name
      super
      @path.pop
    end

    def visit(ref : AST::TypeReference)
      if ref.type == @root_type
        raise "Detected type recursion: #{@path.join(".")}"
      end
      visit ref.type
      super
    end
  end

  class CheckDontReturnSecret < Visitor
    @inreturn = false
    @path = [] of String

    def visit(op : AST::Operation)
      @inreturn = true
      @path.push op.name + "()"
      visit op.return_type
      @path.pop
      @inreturn = false
    end

    def visit(ref : AST::TypeReference)
      visit ref.type
    end

    def visit(field : AST::Field)
      @path.push field.name
      if @inreturn && field.secret
        raise "Can't return a secret value at #{@path.join(".")}"
      end
      super
      @path.pop
    end
  end

  class CheckNamingForGettersReturningBool < Visitor
    def visit(op : AST::GetOperation)
      super
      is_bool = op.return_type.is_a? AST::BoolPrimitiveType
      has_bool_name = op.name =~ /^(is|has|can|may|should)/
      if is_bool && !has_bool_name
        raise "Get operation '#{op.name}' returns bool but isn't named accordingly"
      elsif !is_bool && has_bool_name
        raise "Get operation '#{op.name}' doesn't return bool but its name suggest it does"
      end
    end
  end

  class CheckEmptyEnum < Visitor
    def visit(t : AST::EnumType)
      super
      if t.values.size == 0
        raise "Enum '#{t.name}' is empty"
      end
    end
  end

  class GiveStructAndEnumTypeNames < Visitor
    @path = [] of String

    def visit(definition : AST::TypeDefinition)
      @path = [definition.name]
      super
    end

    def visit(operation : AST::Operation)
      @path = [operation.name]
      super
    end

    def visit(field : AST::Field)
      @path.push field.name[0].upcase + field.name[1..-1]
      super
      @path.pop
    end

    def visit(t : AST::StructType)
      t.name = @path.join("")
      super
    end

    def visit(t : AST::EnumType)
      t.name = @path.join("")
      super
    end
  end

  class CollectStructAndEnumTypes < Visitor
    def visit(t : AST::StructType)
      @ast.struct_types << t
      super
    end

    def visit(t : AST::EnumType)
      @ast.enum_types << t
      super
    end
  end
end

module AST
  class ApiDescription
    property struct_types = [] of AST::StructType
    property enum_types = [] of AST::EnumType

    def semantic
      errors << "Fatal"
      errors << "Connection"
      error_types_enum = AST::EnumType.new
      error_types_enum.values = errors
      error_types_enum_def = AST::TypeDefinition.new
      error_types_enum_def.name = "ErrorType"
      error_types_enum_def.type = error_types_enum
      type_definitions << error_types_enum_def

      op = AST::FunctionOperation.new
      op.name = "ping"
      op.return_type = AST::StringPrimitiveType.new
      operations << op

      op = AST::FunctionOperation.new
      op.name = "setPushToken"
      op.args = [AST::Field.new]
      op.args[0].name = "token"
      op.args[0].type = AST::StringPrimitiveType.new
      op.return_type = AST::VoidPrimitiveType.new
      operations << op

      # TODO: Topological Ordering:
      Semantic::CheckEveryTypeDefined.new(self).visit(self)
      Semantic::CheckNoRecursiveTypes.new(self).visit(self)
      Semantic::CheckDontReturnSecret.new(self).visit(self)
      Semantic::CheckNamingForGettersReturningBool.new(self).visit(self)
      Semantic::GiveStructAndEnumTypeNames.new(self).visit(self)
      Semantic::CheckEmptyEnum.new(self).visit(self)
      Semantic::CollectStructAndEnumTypes.new(self).visit(self)
    end
  end

  class TypeReference
    property! type : Type
  end

  class StructType
    property! name : String
  end

  class EnumType
    property! name : String
  end

  abstract class Operation
    def pretty_name
      name
    end
  end

  class GetOperation < Operation
    def pretty_name
      return_type.is_a?(BoolPrimitiveType) ? name : "get" + name[0].upcase + name[1..-1]
    end
  end
end
