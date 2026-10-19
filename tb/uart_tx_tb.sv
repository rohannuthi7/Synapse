`timescale 1ns/1ps

module uart_tx_tb;
    localparam int CLKS_PER_BIT = 434;

    logic       clk = 0;
    logic       rst;
    logic [7:0] data;
    logic       send;
    logic       tx;
    logic       busy;

    uart_tx #(.CLKS_PER_BIT(CLKS_PER_BIT)) dut (
        .clk  (clk),
        .rst  (rst),
        .data (data),
        .send (send),
        .tx   (tx),
        .busy (busy)
    );

    always #10 clk = ~clk;

    task automatic expect_bit(input logic level, input logic [7:0] value, input string name);
        int unsigned n;
        for (n = 0; n < CLKS_PER_BIT; n++) begin
            @(posedge clk);
            #1;
            if (tx !== level)
                $fatal(1, "%s bit broke on clock %0d for %02h", name, n, value);
        end
    endtask

    task automatic send_byte(input logic [7:0] value);
        int unsigned i;
        logic [7:0] got;

        @(posedge clk);
        #1;
        data = value;
        send = 1'b1;
        @(posedge clk);
        #1;
        send = 1'b0;

        expect_bit(1'b0, value, "start");

        got = '0;
        for (i = 0; i < 8; i++) begin
            @(posedge clk);
            #1;
            got[i] = tx;
            for (int unsigned n = 1; n < CLKS_PER_BIT; n++) begin
                @(posedge clk);
                #1;
                if (tx !== got[i])
                    $fatal(1, "data bit %0d broke for %02h", i, value);
            end
        end

        expect_bit(1'b1, value, "stop");

        if (got !== value)
            $fatal(1, "sent %02h, pin showed %02h", value, got);
        if (busy !== 1'b0)
            $fatal(1, "busy still set after %02h", value);
    endtask

    initial begin
        rst  = 1'b1;
        data = '0;
        send = 1'b0;
        repeat (4) @(posedge clk);
        #1;
        rst = 1'b0;
        @(posedge clk);
        #1;

        if (tx !== 1'b1)
            $fatal(1, "idle level is not high");

        send_byte(8'h55);
        send_byte(8'hA5);
        send_byte(8'h00);
        send_byte(8'hFF);

        $display("uart_tx: 0x55 0xA5 0x00 0xFF matched, %0d clocks per bit", CLKS_PER_BIT);
        $finish;
    end
endmodule
