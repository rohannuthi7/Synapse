module uart_rx #(
    parameter int CLKS_PER_BIT = 434
) (
    input  var logic       clk,
    input  var logic       rst,
    input  var logic       rx,
    output logic [7:0]     data,
    output logic           valid
);
    typedef enum logic [1:0] {
        S_IDLE,
        S_START,
        S_DATA,
        S_STOP
    } state_t;

    state_t     state;
    logic [8:0] clk_count;
    logic [2:0] bit_idx;
    logic [7:0] shift;

    always_ff @(posedge clk) begin
        if (rst) begin
            state     <= S_IDLE; // go to IDLE when reset 
            valid     <= 1'b0;
            data      <= '0; 
            clk_count <= '0;
            bit_idx   <= '0;
            shift     <= '0;
        end else begin
            valid <= 1'b0;
            case (state)
                S_IDLE: begin
                    clk_count <= '0;
                    bit_idx   <= '0;
                    if (!rx) begin
                        state <= S_START;
                    end else begin
                        state <= S_IDLE;
                    end
                end
                S_START: begin
                    if (clk_count == CLKS_PER_BIT / 2 - 1) begin
                        clk_count <= '0;
                        if (!rx)
                            state <= S_DATA;
                        else
                            state <= S_IDLE;
                    end else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end
                S_DATA: begin
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count      <= '0;
                        shift[bit_idx] <= rx; 
                        if (bit_idx == 3'd7) begin
                            bit_idx <= '0;
                            state   <= S_STOP;
                        end else begin
                            bit_idx <= bit_idx + 1'b1;
                        end
                    end else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end
                S_STOP: begin
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= '0;
                        if (rx) begin
                            data  <= shift;
                            valid <= 1'b1;
                        end
                        state <= S_IDLE;
                    end else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end
                default: begin
                    state <= S_IDLE;
                end
            endcase
        end
    end

endmodule
