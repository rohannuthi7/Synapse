module winning_digit (
    input var logic signed [21:0] score_out [0:9],
    output logic            [7:0] digit,
    output logic            [7:0] flags
);
    logic signed [21:0] best;

    always_comb begin
        best  = score_out[0];
        digit = 8'd0;
        for (int i = 1; i < 10; i++) begin
            if (score_out[i] > best) begin
                best  = score_out[i];
                digit = i[7:0];
            end
        end

        flags = '0;
        for (int i = 0; i < 10; i++) begin
            if (i[7:0] != digit && score_out[i] == best)
                flags[0] = 1'b1;
        end
    end

endmodule
