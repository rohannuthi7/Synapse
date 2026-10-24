module run (
    input var logic clk,
    input var logic rst,
    input var logic good,
    input var logic [7:0] opcode,
    input var logic [7:0] x [0:63],
    input var logic signed [7:0] w [0:9][0:63],
    output logic signed [21:0] score_out [0:9],
    output logic scores_ready
);

/*
 * A good packet with opcode 0x04 starts a run.
 * One score module is reused for digits 0 through 9.
 * w_digit is the 64 weights of the digit currently selected.
 * start is 1 for one clock while that digit is held still. Score samples
 * x and w on the following clock. When done is 1, sum is that digit's
 * score and it is stored in score_out[digit].
 * scores_ready is 1 for one clock after digit 9's sum is already in score_out.
 */

    typedef enum logic [1:0] {IDLE, START, WAIT, DONE} state_t;

    state_t state;
    logic [3:0] digit;
    logic signed [7:0] w_digit [0:63];
    logic signed [21:0] sum;
    logic start;
    logic done;

    always_comb begin
        for (int i = 0; i < 64; i++)
            w_digit[i] = w[digit][i];
    end

    score u_score (
        .clk   (clk),
        .rst   (rst),
        .start (start),
        .x     (x),
        .w     (w_digit),
        .sum   (sum),
        .done  (done)
    );

    always_ff @(posedge clk) begin
        if (rst) begin
            state        <= IDLE;
            digit        <= '0;
            scores_ready <= 1'b0;
            start        <= 1'b0;
        end else begin
            scores_ready <= 1'b0;
            start        <= 1'b0;
            case (state)
                IDLE: begin
                    if (good && opcode == 8'h04) begin
                        digit <= '0;
                        state <= START;
                    end
                end
                START: begin
                    start <= 1'b1;
                    state <= WAIT;
                end
                WAIT: begin
                    if (done) begin
                        score_out[digit] <= sum;
                        if (digit == 4'd9)
                            state <= DONE;
                        else begin
                            digit <= digit + 4'd1;
                            state <= START;
                        end
                    end
                end
                DONE: begin
                    scores_ready <= 1'b1;
                    state        <= IDLE;
                end
                default: begin
                    state <= IDLE;
                end
            endcase
        end
    end
endmodule
