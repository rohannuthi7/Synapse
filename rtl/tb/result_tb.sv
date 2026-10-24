`timescale 1ns/1ps

module result_tb;
    localparam int CLKS_PER_BIT = 4;

    logic clk = 0;
    logic rst;
    logic scores_ready;
    logic signed [21:0] score_out [0:9];
    logic [7:0] digit;
    logic [7:0] flags;
    logic ack;
    logic nack;
    logic [7:0] nack_reason;
    logic tx;

    result #(.CLKS_PER_BIT(CLKS_PER_BIT)) dut (
        .clk          (clk),
        .rst          (rst),
        .scores_ready (scores_ready),
        .score_out    (score_out),
        .digit        (digit),
        .flags        (flags),
        .ack          (ack),
        .nack         (nack),
        .nack_reason  (nack_reason),
        .tx           (tx)
    );

    always #10 clk = ~clk;

    logic [7:0] got [0:45];
    int unsigned n_bytes;

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

    initial begin
        rst = 1'b1;
        scores_ready = 1'b0;
        ack = 1'b0;
        nack = 1'b0;
        nack_reason = '0;
        digit = 8'd7;
        flags = 8'h01;
        for (int i = 0; i < 10; i++)
            score_out[i] = '0;
        score_out[0] = 22'sd150;
        score_out[1] = 22'sh200000;

        repeat (4) @(posedge clk);
        rst = 1'b0;
        @(posedge clk);
        scores_ready = 1'b1;
        @(posedge clk);
        scores_ready = 1'b0;

        for (n_bytes = 0; n_bytes < 46; n_bytes++)
            recv_byte(got[n_bytes]);

        if (got[0] !== 8'hA5 || got[1] !== 8'h83 || got[2] !== 8'd42)
            $fatal(1, "header %02h %02h %02h", got[0], got[1], got[2]);
        if (got[3] !== 8'h96 || got[4] !== 8'h00 || got[5] !== 8'h00 || got[6] !== 8'h00)
            $fatal(1, "score 0 bytes %02h %02h %02h %02h", got[3], got[4], got[5], got[6]);
        if (got[7] !== 8'h00 || got[8] !== 8'h00 || got[9] !== 8'hE0 || got[10] !== 8'hFF)
            $fatal(1, "score 1 bytes %02h %02h %02h %02h", got[7], got[8], got[9], got[10]);
        if (got[43] !== 8'd7 || got[44] !== 8'h01)
            $fatal(1, "digit/flags %02h %02h", got[43], got[44]);

        begin
            logic [7:0] acc;
            acc = '0;
            for (int i = 0; i < 45; i++)
                acc ^= got[i];
            if (got[45] !== acc)
                $fatal(1, "checksum got %02h want %02h", got[45], acc);
        end

        $display("result: 46 byte packet matched");
        $finish;
    end
endmodule
