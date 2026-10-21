`timescale 1ns/1ps

module uart_rx_tb;
    localparam int CLKS_PER_BIT = 434;

    logic       clk = 0;
    logic       rst;
    logic       rx;
    logic [7:0] data;
    logic       valid;
    logic       seen;
    logic [7:0] got;

    uart_rx #(.CLKS_PER_BIT(CLKS_PER_BIT)) dut (
        .clk   (clk),
        .rst   (rst),
        .rx    (rx),
        .data  (data),
        .valid (valid)
    );

    always #10 clk = ~clk;

    always @(posedge clk) begin
        if (valid) begin
            seen <= 1'b1;
            got  <= data;
        end
    end

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

    task automatic check_byte(input logic [7:0] value);
        seen = 1'b0;
        send_byte(value);
        @(posedge clk);
        #1;
        if (!seen || got !== value)
            $fatal(1, "expected %02h, got %02h seen=%b", value, got, seen);
    endtask

    initial begin
        rst  = 1'b1;
        rx   = 1'b1;
        seen = 1'b0;
        repeat (4) @(posedge clk);
        #1;
        rst = 1'b0;

        check_byte(8'h03);
        check_byte(8'hA5);
        check_byte(8'h00);
        check_byte(8'hFF);

        $display("uart_rx: 0x03 0xA5 0x00 0xFF matched");
        $finish;
    end
endmodule
