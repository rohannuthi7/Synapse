`timescale 1ns/1ps

// Digit d has a single weight of d+1 on cell 0. x[0] is 10.
// score_out[d] must be 10 * (d + 1), and scores_ready is one clock.
module run_tb;
    logic clk = 0;
    logic rst;
    logic good;
    logic [7:0] opcode;
    logic [7:0] x [0:63];
    logic signed [7:0] w [0:9][0:63];
    logic signed [21:0] score_out [0:9];
    logic scores_ready;

    run dut (
        .clk          (clk),
        .rst          (rst),
        .good         (good),
        .opcode       (opcode),
        .x            (x),
        .w            (w),
        .score_out    (score_out),
        .scores_ready (scores_ready)
    );

    always #10 clk = ~clk;

    initial begin
        rst   = 1'b1;
        good  = 1'b0;
        opcode = '0;
        for (int i = 0; i < 64; i++)
            x[i] = '0;
        for (int d = 0; d < 10; d++)
            for (int i = 0; i < 64; i++)
                w[d][i] = '0;
        x[0] = 8'd10;
        for (int d = 0; d < 10; d++)
            w[d][0] = 8'(d + 1);

        repeat (4) @(posedge clk);
        rst = 1'b0;

        @(negedge clk);
        good   = 1'b1;
        opcode = 8'h04;
        @(negedge clk);
        good   = 1'b0;
        opcode = '0;

        for (int n = 0; n < 400; n++) begin
            @(posedge clk);
            if (scores_ready === 1'b1)
                break;
            if (n == 399)
                $fatal(1, "run: scores_ready did not rise");
        end

        for (int d = 0; d < 10; d++) begin
            if (int'(score_out[d]) !== 10 * (d + 1))
                $fatal(1, "run: digit %0d score %0d", d, int'(score_out[d]));
        end

        @(posedge clk);
        if (scores_ready !== 1'b0)
            $fatal(1, "run: scores_ready stayed high");

        $display("run: ten digits scored, ready for one clock");
        $finish;
    end
endmodule
