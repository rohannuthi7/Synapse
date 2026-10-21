module score_tb;
    logic               [7:0] x [0:63];
    logic signed        [7:0] w [0:63];
    logic signed       [21:0] sum;

    score dut (
        .x   (x),
        .w   (w),
        .sum (sum)
    );

    function automatic int signed ref_sum;
        int signed acc;
        acc = 0;
        for (int i = 0; i < 64; i++)
            acc += int'(x[i]) * int'(w[i]);
        return acc;
    endfunction

    task automatic expect_sum(input string name);
        int signed want;
        #1;
        want = ref_sum();
        if (int'(sum) !== want)
            $fatal(1, "%s: sum %0d expected %0d", name, int'(sum), want);
        $display("%s: %0d", name, int'(sum));
    endtask

    initial begin
        for (int i = 0; i < 64; i++) begin
            x[i] = 8'h00;
            w[i] = -8'sd128;
        end
        expect_sum("all dark");

        for (int i = 0; i < 64; i++)
            x[i] = 8'hFF;
        expect_sum("all bright, weight -128");

        for (int i = 0; i < 64; i++) begin
            x[i] = 8'h00;
            w[i] = 8'sd0;
        end
        x[0] = 8'hFF;
        w[0] = 8'sd127;
        expect_sum("one cell 255 * 127");

        x[0] = 8'd1;
        w[0] = -8'sd1;
        expect_sum("one cell 1 * -1");

        x[0] = 8'd128;
        w[0] = -8'sd2;
        x[5] = 8'd40;
        w[5] = 8'sd3;
        x[63] = 8'd255;
        w[63] = -8'sd7;
        expect_sum("mixed signs");

        $display("score: brightness multiply matched");
        $finish;
    end
endmodule
