`timescale 1ns/1ps

module winning_digit_tb;
    logic signed [21:0] score_out [0:9];
    logic [7:0] digit;
    logic [7:0] flags;

    winning_digit dut (
        .score_out (score_out),
        .digit     (digit),
        .flags     (flags)
    );

    initial begin
        for (int i = 0; i < 10; i++)
            score_out[i] = '0;

        score_out[4] = 22'sd9;
        #1;
        if (digit !== 8'd4 || flags !== 8'h00)
            $fatal(1, "unique winner digit %0d flags %02h", digit, flags);

        score_out[7] = 22'sd9;
        #1;
        if (digit !== 8'd4 || flags[0] !== 1'b1)
            $fatal(1, "tie digit %0d flags %02h", digit, flags);

        score_out[2] = -22'sd3;
        #1;
        if (digit !== 8'd4)
            $fatal(1, "negative score took the win: %0d", digit);

        $display("winning_digit: lowest index wins, tie flagged");
        $finish;
    end
endmodule
