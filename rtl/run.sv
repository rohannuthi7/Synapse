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
 * One score module is reused for digits 0 through 9, one digit per clock.
 * w_digit is the 64 weights of the digit currently selected.
 * sum is that digit's 22-bit score. SCORE stores it in score_out[digit].
 * scores_ready is 1 for the clock when digit 9 has just been stored.
 */

    typedef enum logic {IDLE,SCORE} state_t; 

    state_t state;
    logic [3:0] digit; 
    logic signed [7:0] w_digit [0:63];
    logic signed [21:0] sum; 

    // Copy w[digit] into the one grid score can read. Follows digit immediately.
    always_comb begin  
        for (int i = 0; i < 64; i++) 
            w_digit[i] = w[digit][i]; 
    end

    score u_score (
        .x(x),
        .w(w_digit), 
        .sum(sum)
    );

    always_ff @(posedge clk) begin
        if (rst) begin
            state <= IDLE;
            digit <= '0; 
            scores_ready <= 1'b0; 
        end else begin 
            scores_ready <= 1'b0; 
            case (state) 
                IDLE: begin 
                    if (good && opcode == 8'h04) begin 
                        digit <= '0; // first SCORE clock uses digit 0
                        state <= SCORE; 
                    end 
                end
                SCORE: begin 
                    score_out[digit] <= sum; // sum is already the score for this digit
                    if (digit == 4'd9) begin 
                        scores_ready <= 1'b1; // one clock, cleared at the top next cycle
                        state <= IDLE; 
                    end else begin 
                        digit <= digit + 1; 
                    end 
                end
            endcase
        end
    end
endmodule 