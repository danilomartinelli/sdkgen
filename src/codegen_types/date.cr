module AST
  class DatePrimitiveType
    def typescript_decode(expr)
      "moment(#{expr}, \"YYYY-MM-DD\").toDate()"
    end

    def typescript_encode(expr)
      "moment(#{expr}).format(\"YYYY-MM-DD\")"
    end

    def typescript_native_type
      "Date"
    end

    def typescript_check_encoded(expr, descr)
      ""
    end
  end
end
