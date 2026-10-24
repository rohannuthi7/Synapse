`timescale 1ns/1ps

// A ping should come back as ACK: A5 82 01 00 26.
module synapse_top_tb;
    localparam int CLKS_PER_BIT = 4;

    logic clk = 0;
    logic rst;
    logic rx;
    logic tx;

    synapse_top #(.CLKS_PER_BIT(CLKS_PER_BIT)) dut (
        .clk (clk),
        .rst (rst),
        .rx  (rx),
        .tx  (tx)
    );

    always #10 clk = ~clk;

    task automatic hold_bit(input logic level);
        rx = level;
        repeat (CLKS_PER_BIT) @(posedge clk);
    endtask

    task automatic send_byte(input logic [7:0] value);
        int unsigned i;
        hold_bit(1'b0);
        for (i = 0; i < 8; i++)
            hold_bit(value[i]);
        hold_bit(1'b1);
    endtask

    task automatic recv_byte(output logic [7:0] value);
        int unsigned i;
        int unsigned n;
        @(negedge tx);
        repeat (CLKS_PER_BIT + CLKS_PER_BIT/2) @(posedge clk);
        value = '0;
        for (i = 0; i < 8; i++) begin
            value[i] = tx;
            for (n = 0; n < CLKS_PER_BIT; n++)
                @(posedge clk);
        end
    endtask

    logic [7:0] got [0:4];

    initial begin
        rst = 1'b1;
        rx  = 1'b1;
        repeat (4) @(posedge clk);
        rst = 1'b0;
        @(posedge clk);

        fork
            begin
                send_byte(8'hA5);
                send_byte(8'h01);
                send_byte(8'h00);
                send_byte(8'hA4);
            end
            begin
                for (int i = 0; i < 5; i++)
                    recv_byte(got[i]);
            end
        join

        if (got[0] !== 8'hA5 || got[1] !== 8'h82 || got[2] !== 8'd1 || got[3] !== 8'h00 || got[4] !== 8'h26)
            $fatal(1, "ACK %02h %02h %02h %02h %02h", got[0], got[1], got[2], got[3], got[4]);

        $display("synapse_top: ping answered with ACK");
        $finish;
    end
endmodule
