// represents wrapper on every message
// sync byte 0xA5, opcode, length, payload, and XOR checksum

// decides how bytes form a message

module packet #(
    // 10 ms at 50 MHz. A USB-UART adapter can pause about 1 ms between the
    // 64-byte USB transfers that make up one packet, so this must be far longer.
    parameter int TIMEOUT_CLKS = 500_000
) (
    input var logic clk,
    input var logic rst,
    input var logic [7:0] data,
    input var logic valid,
    output logic        good,
    output logic        bad,
    output logic [7:0]  reason, // 0x01 bad checksum, 0x02 unknown opcode, 0x03 length mismatch
    output logic [7:0]  opcode,
    output logic [7:0]  length,
    output logic [7:0]  payload [0:64]
);

    typedef enum logic [2:0] { // need 3 bits to represent up to 8 states, 3 states are unused
        START,
        OPCODE,
        LENGTH,
        PAYLOAD,
        CHECKSUM
    } state_t;

    state_t     state;
    logic [7:0] running_xor; // used for checksum
    logic [7:0] len_payload; // fits 65
    logic [$clog2(TIMEOUT_CLKS + 1) - 1:0] idle_clks; // clocks since the last byte of this packet

    always_ff @(posedge clk) begin
        if (rst) begin
            state <= START;
            running_xor <= '0;
            len_payload <= '0;
            good <= 1'b0;
            bad <= 1'b0;
            reason <= '0;
            idle_clks <= '0;
        end else begin
            good <= 1'b0;
            bad <= 1'b0;
            if (valid || state == START)
                idle_clks <= '0;
            else
                idle_clks <= idle_clks + 1'b1;

            // A byte lost mid-packet would otherwise leave the parser eating the
            // next packet as payload. Drop the partial packet silently; the host
            // times out waiting for a reply and resends.
            if (!valid && state != START && idle_clks == TIMEOUT_CLKS - 1) begin
                state <= START;
            end else if (valid) begin
                case (state)
                    START: begin
                        if (data == 8'hA5) begin
                            running_xor <= data;
                            len_payload <= '0; // next picture starts at payload[0]
                            state       <= OPCODE;
                        end
                    end
                    OPCODE: begin
                        opcode      <= data;
                        running_xor <= running_xor ^ data;
                        if (data == 8'h01 || data == 8'h02 || data == 8'h03 || data == 8'h04) begin
                            state <= LENGTH;
                        end else begin
                            bad    <= 1'b1;
                            reason <= 8'h02; // unknown opcode
                            state  <= START; // go back to the start
                        end
                    end
                    LENGTH: begin
                        length      <= data; // take in the length
                        running_xor <= running_xor ^ data;
                        if (data == 8'h00 && (opcode == 8'h01 || opcode == 8'h04)) begin
                            state <= CHECKSUM;
                        end else if (data == 8'h40 && opcode == 8'h02) begin
                            state <= PAYLOAD;
                        end else if (data == 8'h41 && opcode == 8'h03) begin
                            state <= PAYLOAD;
                        end else begin
                            bad    <= 1'b1;
                            reason <= 8'h03; // length does not match opcode
                            state  <= START; // if none of the above conditions are met, then it's invalid, go to start
                        end
                    end
                    PAYLOAD: begin
                        payload[len_payload] <= data;
                        len_payload          <= len_payload + 1;
                        running_xor          <= data ^ running_xor;
                        if (len_payload + 1 == length) begin
                            state <= CHECKSUM;
                        end else begin
                            state <= PAYLOAD; // stay in payload till all bytes are processed for weights or brightness
                        end
                    end
                    CHECKSUM: begin
                        if (data == running_xor) begin
                            good <= 1'b1;
                        end else begin
                            bad    <= 1'b1;
                            reason <= 8'h01; // bad checksum
                        end
                        state <= START;
                    end
                endcase
            end
        end
    end

endmodule
