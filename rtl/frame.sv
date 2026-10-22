module frame (
    input var logic       clk,
    input var logic       rst,
    input var logic       good,
    input var logic [7:0] opcode,
    input var logic [7:0] payload [0:64],
    output logic    [7:0] x [0:63]
);

/*
 * x is written on the clock where the checksum is equal to the xor of all prev bytes
 * good is 1 for that clock, and the opcode is 0x02
 * all 64 cells copy from payload on that same clock, using the for loop below 
 * a failed checksum leaves good at 0, so x stays as it was until frame is written properly 
 */

    always_ff @(posedge clk) begin
        if (rst) begin
            for (int i = 0; i < 64; i++)
                x[i] <= 8h'00;
        end else if (good && opcode == 8'h02) begin
            for (int i = 0; i < 64; i++)
                x[i] <= payload[i]; // cell 0 is payload[0]
        end
    end

endmodule
