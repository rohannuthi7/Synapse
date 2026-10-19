module uart_tx #(
    parameter int CLKS_PER_BIT = 434
) (
    input  var logic       clk,
    input  var logic       rst,
    input  var logic [7:0] data,
    input  var logic       send,
    output logic           tx,
    output logic           busy
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
            state     <= S_IDLE;
            tx        <= 1'b1;
            busy      <= 1'b0;
            clk_count <= '0;
            bit_idx   <= '0;
            shift     <= '0;
        end else begin
            case (state)
                S_IDLE: begin
                    tx        <= 1'b1;
                    busy      <= 1'b0;
                    clk_count <= '0;
                    bit_idx   <= '0;
                    if (send) begin
                        shift <= data;
                        busy  <= 1'b1;
                        state <= S_START;
                    end
                end
                S_START: begin
                    tx <= 1'b0;
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= '0;
                        state     <= S_DATA;
                    end else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end
                S_DATA: begin
                    tx <= shift[0];
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= '0;
                        shift     <= shift >> 1;
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
                    tx <= 1'b1;
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= '0;
                        busy      <= 1'b0;
                        state     <= S_IDLE;
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
