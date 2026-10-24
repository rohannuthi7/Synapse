`timescale 1ns/1ps

module winning_digit_tb;
    logic clk = 0;
    logic rst;
    logic signed [21:0] score_out [0:9];
    logic [7:0] digit;
    logic [7:0] flags;

    winning_digit dut (
        .clk       (clk),
        .rst       (rst),
        .score_out (score_out),
        .digit     (digit),
        .flags     (flags)
    );

    always #10 clk = ~clk;

    task automatic check(input string name, input logic [7:0] want_digit, input logic want_tie);
        @(posedge clk);
        #1;
        if (digit !== want_digit || flags[0] !== want_tie)
            $fatal(1, "%s: digit %0d flags %02h", name, digit, flags);
    endtask

    initial begin
        rst = 1'b1;
        for (int i = 0; i < 10; i++)
            score_out[i] = '0;
        repeat (2) @(posedge clk);
        rst = 1'b0;

        score_out[4] = 22'sd9;
        check("unique winner", 8'd4, 1'b0);

        score_out[7] = 22'sd9;
        check("tie", 8'd4, 1'b1);

        score_out[2] = -22'sd3;
        check("negative", 8'd4, 1'b1);

        $display("winning_digit: lowest index wins, tie flagged");
        $finish;
    end
endmodule
