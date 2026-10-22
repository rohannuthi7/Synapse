module weights (
    input var logic           clk,
    input var logic           rst,
    input var logic           good,
    input var logic     [7:0] opcode,
    input var logic     [7:0] payload [0:64],
    output logic signed [7:0] w [0:9][0:63]
);

/*
 * w is written on the clock where the checksum matches
 * good is 1 for that clock, and the opcode is 0x03
 * payload[0] is the digit, 0 through 9 
 * payload[1] through payload[64] are that digit's 64 signed weights
 * a failed checksum leaves good at 0, so the grids stay as they were
 */

    always_ff @(posedge clk) begin
        if (rst) begin
            for (int d = 0; d < 10; d++)
                for (int i = 0; i < 64; i++)
                    w[d][i] <= 8'h00;
        end else if (good && opcode == 8'h03 && payload[0] <= 8'd9) begin
            for (int i = 0; i < 64; i++)
                w[payload[0]][i] <= signed'(payload[i + 1]);
        end
    end

endmodule
