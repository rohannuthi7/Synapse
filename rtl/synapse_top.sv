// DE1-SoC: clk CLOCK_50 PIN_AF14, rx GPIO_0[0] PIN_AC18, tx GPIO_0[1] PIN_Y17.
// rst is active high. One USB-UART: adapter TX -> rx, tx -> adapter RX, GND to GND.

module synapse_top #(
    parameter int CLKS_PER_BIT = 434
) (
    input  var logic clk,
    input  var logic rst,
    input  var logic rx,
    output logic     tx
);
    logic        rx_valid;
    logic [7:0]  rx_data;
    logic        good;
    logic        bad;
    logic [7:0]  reason;
    logic [7:0]  opcode;
    logic [7:0]  pkt_length;
    logic [7:0]  payload [0:64];
    logic [7:0]  x [0:63];
    logic signed [7:0] w [0:9][0:63];
    logic signed [21:0] score_out [0:9];
    logic        scores_ready;
    logic [7:0]  digit;
    logic [7:0]  flags;

    uart_rx #(.CLKS_PER_BIT(CLKS_PER_BIT)) u_rx (
        .clk   (clk),
        .rst   (rst),
        .rx    (rx),
        .data  (rx_data),
        .valid (rx_valid)
    );

    packet u_packet (
        .clk     (clk),
        .rst     (rst),
        .data    (rx_data),
        .valid   (rx_valid),
        .good    (good),
        .bad     (bad),
        .reason  (reason),
        .opcode  (opcode),
        .length  (pkt_length),
        .payload (payload)
    );

    frame u_frame (
        .clk     (clk),
        .rst     (rst),
        .good    (good),
        .opcode  (opcode),
        .payload (payload),
        .x       (x)
    );

    weights u_weights (
        .clk     (clk),
        .rst     (rst),
        .good    (good),
        .opcode  (opcode),
        .payload (payload),
        .w       (w)
    );

    run u_run (
        .clk          (clk),
        .rst          (rst),
        .good         (good),
        .opcode       (opcode),
        .x            (x),
        .w            (w),
        .score_out    (score_out),
        .scores_ready (scores_ready)
    );

    winning_digit u_winner (
        .score_out (score_out),
        .digit     (digit),
        .flags     (flags)
    );

    result #(.CLKS_PER_BIT(CLKS_PER_BIT)) u_result (
        .clk          (clk),
        .rst          (rst),
        .scores_ready (scores_ready),
        .score_out    (score_out),
        .digit        (digit),
        .flags        (flags),
        .ack          (good && (opcode == 8'h01 || opcode == 8'h02 || opcode == 8'h03)),
        .nack         (bad),
        .nack_reason  (reason),
        .tx           (tx)
    );

endmodule
