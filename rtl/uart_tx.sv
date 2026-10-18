module uart_rx #( 
    // needs clks per bit
)   (
    // set inputs and outputs here 

); 

    // need logic for UART state machine 

    // need to declare state, clk count, bit index, and shift 

    // always_ff declarations 
    

    /* 
     * if rst 
     * 1. state becomes idle 
     * 2. valid becomes 0
     * 3. data becomes 0
     * 4. clk count becomes 0
     * 5. bit idx becomes 0
     * 6. shift becomes 0
     */

    /* need 4 cases 
     * one for S_IDLE 
     * one for S_START
     * one for S_DATA
     * one for S_STOP 
     */ 

    // declare default state as IDLE 

    // end 

endmodule 