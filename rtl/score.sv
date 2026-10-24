module score (
    input  var logic               clk,
    input  var logic               rst,
    input  var logic               start,
    input  var logic        [7:0]  x [0:63],
    input  var logic signed [7:0]  w [0:63],
    output logic signed    [21:0]  sum,
    output logic                   done
);

/*
 * Dot product of one digit. The clock that samples start stores x and w.
 * done is 1 for one clock, seven clocks later, and sum is the score.
 *
 *   capture, 64 products, then the adder tree 32, 16, 8, 4, 2, 1
 *
 * Each of those is its own clock. A running sum of all 64 products is one
 * chain, and that chain does not meet the 50 MHz clock.
 */

    logic        [7:0]  x_q  [0:63];
    logic signed [7:0]  w_q  [0:63];
    logic signed [15:0] prod [0:63];
    logic signed [21:0] l0   [0:31];
    logic signed [21:0] l1   [0:15];
    logic signed [21:0] l2   [0:7];
    logic signed [21:0] l3   [0:3];
    logic signed [21:0] l4   [0:1];
    logic        [7:0]  stage;

    assign done = stage[7];

    always_ff @(posedge clk) begin
        if (rst) begin
            stage <= '0;
        end else begin
            stage <= {stage[6:0], start};

            if (start) begin
                for (int i = 0; i < 64; i++) begin
                    x_q[i] <= x[i];
                    w_q[i] <= w[i];
                end
            end

            // Products are 16 bits. 255 * -128 = -32640, which fits.
            if (stage[0]) begin
                for (int i = 0; i < 64; i++)
                    prod[i] <= signed'({1'b0, x_q[i]}) * w_q[i];
            end

            if (stage[1]) begin
                for (int i = 0; i < 32; i++)
                    l0[i] <= 22'(prod[2*i]) + 22'(prod[2*i + 1]);
            end
            if (stage[2]) begin
                for (int i = 0; i < 16; i++)
                    l1[i] <= l0[2*i] + l0[2*i + 1];
            end
            if (stage[3]) begin
                for (int i = 0; i < 8; i++)
                    l2[i] <= l1[2*i] + l1[2*i + 1];
            end
            if (stage[4]) begin
                for (int i = 0; i < 4; i++)
                    l3[i] <= l2[2*i] + l2[2*i + 1];
            end
            if (stage[5]) begin
                for (int i = 0; i < 2; i++)
                    l4[i] <= l3[2*i] + l3[2*i + 1];
            end
            if (stage[6])
                sum <= l4[0] + l4[1];
        end
    end

endmodule
