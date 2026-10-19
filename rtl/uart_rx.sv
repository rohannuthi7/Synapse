module uart_rx #(
    // needs clks per bit
)   (
    // set inputs and outputs here
    // clk, rst, rx pin in
    // data byte out, valid pulse out

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
     *   wait while rx is high
     *   a falling edge is the start bit
     *   clk count and bit idx go to 0
     *   state becomes S_START
     * one for S_START
     *   count to the middle of the start bit, CLKS_PER_BIT / 2
     *   if rx is still low, state becomes S_DATA and clk count goes to 0
     *   if rx is high, it was a glitch, state becomes S_IDLE
     * one for S_DATA
     *   count CLKS_PER_BIT clocks to the middle of the next bit
     *   shift the rx level in, least significant bit first
     *   after 8 bits, state becomes S_STOP
     * one for S_STOP
     *   count CLKS_PER_BIT clocks to the middle of the stop bit
     *   if rx is high, data becomes shift and valid pulses 1
     *   state becomes S_IDLE
     */

    // declare default state as IDLE

    // end

endmodule
