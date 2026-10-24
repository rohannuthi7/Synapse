`timescale 1ns/1ps

// A ping should come back as ACK: A5 82 01 00 26.
// A packet cut off mid-payload is dropped after the timeout, and the next ping still gets its ACK.
// A ping with a bad checksum comes back as NACK, reason 0x01: A5 84 01 01 21.
module synapse_top_tb;
    localparam int CLKS_PER_BIT = 4;
    // A byte is 10 bits, 40 clocks here; the timeout must be longer than that.
    localparam int TIMEOUT_CLKS = 200;

    logic clk = 0;
    logic key0_n;
    logic rx;
    logic tx;

    synapse_top #(.CLKS_PER_BIT(CLKS_PER_BIT), .TIMEOUT_CLKS(TIMEOUT_CLKS)) dut (
        .clk    (clk),
        .key0_n (key0_n),
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

    // Send a ping with the given checksum and collect the 5-byte reply.
    task automatic ping(input logic [7:0] checksum);
        fork
            begin
                send_byte(8'hA5);
                send_byte(8'h01);
                send_byte(8'h00);
                send_byte(checksum);
            end
            begin
                for (int i = 0; i < 5; i++)
                    recv_byte(got[i]);
            end
        join
    endtask

    task automatic expect_reply(input string what, input logic [7:0] op, input logic [7:0] arg, input logic [7:0] sum);
        if (got[0] !== 8'hA5 || got[1] !== op || got[2] !== 8'd1 || got[3] !== arg || got[4] !== sum)
            $fatal(1, "%s: %02h %02h %02h %02h %02h", what, got[0], got[1], got[2], got[3], got[4]);
    endtask

    initial begin
        key0_n = 1'b0;
        rx     = 1'b1;
        repeat (4) @(posedge clk);
        key0_n = 1'b1;
        repeat (4) @(posedge clk);

        ping(8'hA4);
        expect_reply("ACK", 8'h82, 8'h00, 8'h26);
        $display("synapse_top: ping answered with ACK");

        // FRAME header promising 64 bytes, then only 3 of them.
        send_byte(8'hA5);
        send_byte(8'h02);
        send_byte(8'h40);
        send_byte(8'h11);
        send_byte(8'h22);
        send_byte(8'h33);
        repeat (TIMEOUT_CLKS + 10) @(posedge clk);
        ping(8'hA4);
        expect_reply("ACK after timeout", 8'h82, 8'h00, 8'h26);
        $display("synapse_top: truncated packet dropped, next ping answered");

        ping(8'hA5);
        expect_reply("NACK", 8'h84, 8'h01, 8'h21);
        $display("synapse_top: bad checksum answered with NACK 01");

        $finish;
    end
endmodule
