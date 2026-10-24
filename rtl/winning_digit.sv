module winning_digit (
    input var logic               clk,
    input var logic               rst,
    input var logic signed [21:0] score_out [0:9],
    output logic            [7:0] digit,
    output logic            [7:0] flags
);
    // Lower index wins a tie. The compare is a tree, then registered.
    // flags is the tie bit, taken from that registered winner, so the tie
    // check is not stacked on the compare in the same clock.
    logic signed [21:0] s1 [0:4];
    logic        [7:0]  n1 [0:4];
    logic signed [21:0] s2 [0:2];
    logic        [7:0]  n2 [0:2];
    logic signed [21:0] s3 [0:1];
    logic        [7:0]  n3 [0:1];
    logic signed [21:0] best_c;
    logic        [7:0]  digit_c;
    logic signed [21:0] best;

    always_comb begin
        for (int i = 0; i < 5; i++) begin
            if (score_out[2*i + 1] > score_out[2*i]) begin
                s1[i] = score_out[2*i + 1];
                n1[i] = 8'(2*i + 1);
            end else begin
                s1[i] = score_out[2*i];
                n1[i] = 8'(2*i);
            end
        end

        for (int i = 0; i < 2; i++) begin
            if (s1[2*i + 1] > s1[2*i]) begin
                s2[i] = s1[2*i + 1];
                n2[i] = n1[2*i + 1];
            end else begin
                s2[i] = s1[2*i];
                n2[i] = n1[2*i];
            end
        end
        s2[2] = s1[4];
        n2[2] = n1[4];

        if (s2[1] > s2[0]) begin
            s3[0] = s2[1];
            n3[0] = n2[1];
        end else begin
            s3[0] = s2[0];
            n3[0] = n2[0];
        end
        s3[1] = s2[2];
        n3[1] = n2[2];

        if (s3[1] > s3[0]) begin
            best_c  = s3[1];
            digit_c = n3[1];
        end else begin
            best_c  = s3[0];
            digit_c = n3[0];
        end
    end

    always_ff @(posedge clk) begin
        if (rst) begin
            digit <= '0;
            best  <= '0;
        end else begin
            digit <= digit_c;
            best  <= best_c;
        end
    end

    always_comb begin
        flags    = '0;
        flags[0] = (digit != 8'd0 && score_out[0] == best)
                 | (digit != 8'd1 && score_out[1] == best)
                 | (digit != 8'd2 && score_out[2] == best)
                 | (digit != 8'd3 && score_out[3] == best)
                 | (digit != 8'd4 && score_out[4] == best)
                 | (digit != 8'd5 && score_out[5] == best)
                 | (digit != 8'd6 && score_out[6] == best)
                 | (digit != 8'd7 && score_out[7] == best)
                 | (digit != 8'd8 && score_out[8] == best)
                 | (digit != 8'd9 && score_out[9] == best);
    end

endmodule
