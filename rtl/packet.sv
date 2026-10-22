// represents wrapper on every message
// sync byte 0xA5, opcode, length, payload, and XOR checksum 

// decides how bytes form a message

module packet ( 
    input var logic clk, 
    input var logic rst, 
    input var logic [7:0] data,
    input var logic valid
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
    logic [7:0] opcode; 
    logic [7:0] length; 
    logic [7:0] payload [0:64]; // 65 * 8 represents max total bits transferred for the weights 
    logic [7:0] len_payload; // fits 65

    always_ff @(posedge clk) begin
        if (rst) begin 
            state <= START;
            running_xor <= '0;
            len_payload <= '0;
        end else if (valid) begin 
            case (state) 
                START: begin
                    if (data = 8'hA5) begin 
                        running_xor <= data; 
                        state       <= OPCODE: 
                    end 
                end
                OPCODE: begin 
                    if (opcode = 8'h01) begin
                    

                    else if (opcode = 8'h02) begin


                    else if (opcode = 8'h03) begin 


                    else if (opcode = 8'h04) begin


            endcase 

endmodule 