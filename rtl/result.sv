module result #(
    parameter int CLKS_PER_BIT = 434
) (
    input var logic              clk,
    input var logic              rst,
    input var logic              scores_ready,
    input var logic signed [21:0] score_out [0:9],
    input var logic        [7:0] digit,
    input var logic        [7:0] flags,
    input var logic              ack,
    input var logic              nack,
    input var logic        [7:0] nack_reason,
    output logic                  tx
);
    // RESULT is 46 bytes. ACK and NACK are 5: sync, opcode, length 1, payload, checksum.

    typedef enum logic [2:0] {
        IDLE,
        LOAD,
        SEND,
        WAIT_HI,
        WAIT_LO
    } state_t;

    state_t       state;
    logic [5:0]   byte_idx;
    logic [5:0]   last_idx;
    logic [7:0]   image [0:45];
    logic [7:0]   msg [0:45];
    logic [7:0]   tx_data;
    logic         tx_send;
    logic         tx_busy;

    uart_tx #(.CLKS_PER_BIT(CLKS_PER_BIT)) u_tx (
        .clk  (clk),
        .rst  (rst),
        .data (tx_data),
        .send (tx_send),
        .tx   (tx),
        .busy (tx_busy)
    );

    // Build the 46-byte packet from the current scores. Snapshot it when a run finishes.
    always_comb begin
        logic [7:0]  acc;
        logic [31:0] ext;

        image[0] = 8'hA5;
        image[1] = 8'h83;
        image[2] = 8'd42;
        acc    = 8'hA5 ^ 8'h83 ^ 8'd42;

        for (int d = 0; d < 10; d++) begin
            ext = {{10{score_out[d][21]}}, score_out[d]};
            image[3 + 4*d] = ext[7:0];
            image[4 + 4*d] = ext[15:8];
            image[5 + 4*d] = ext[23:16];
            image[6 + 4*d] = ext[31:24];
            acc = acc ^ ext[7:0] ^ ext[15:8] ^ ext[23:16] ^ ext[31:24];
        end

        image[43] = digit;
        image[44] = flags;
        image[45] = acc ^ digit ^ flags;
    end

    always_ff @(posedge clk) begin
        if (rst) begin
            state    <= IDLE;
            byte_idx <= '0;
            last_idx <= '0;
            tx_data  <= '0;
            tx_send  <= 1'b0;
        end else begin
            tx_send <= 1'b0;
            case (state)
                IDLE: begin
                    if (scores_ready) begin
                        msg      <= image;
                        last_idx <= 6'd45;
                        byte_idx <= '0;
                        state    <= LOAD;
                    end else if (nack) begin
                        msg[0]   <= 8'hA5;
                        msg[1]   <= 8'h84;
                        msg[2]   <= 8'd1;
                        msg[3]   <= nack_reason;
                        msg[4]   <= 8'hA5 ^ 8'h84 ^ 8'd1 ^ nack_reason;
                        last_idx <= 6'd4;
                        byte_idx <= '0;
                        state    <= LOAD;
                    end else if (ack) begin
                        msg[0]   <= 8'hA5;
                        msg[1]   <= 8'h82;
                        msg[2]   <= 8'd1;
                        msg[3]   <= 8'h00;
                        msg[4]   <= 8'hA5 ^ 8'h82 ^ 8'd1 ^ 8'h00;
                        last_idx <= 6'd4;
                        byte_idx <= '0;
                        state    <= LOAD;
                    end
                end
                // Put the byte on tx_data one clock before send, so uart_tx samples a stable byte.
                LOAD: begin
                    tx_data <= msg[byte_idx];
                    state   <= SEND;
                end
                SEND: begin
                    tx_send <= 1'b1;
                    state   <= WAIT_HI;
                end
                WAIT_HI: begin
                    if (tx_busy)
                        state <= WAIT_LO;
                end
                WAIT_LO: begin
                    if (!tx_busy) begin
                        if (byte_idx == last_idx)
                            state <= IDLE;
                        else begin
                            byte_idx <= byte_idx + 6'd1;
                            state    <= LOAD;
                        end
                    end
                end
                default: begin
                    state <= IDLE;
                end
            endcase
        end
    end

endmodule
