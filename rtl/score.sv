module score (
    input  var logic        [7:0] x [0:63],
    input  var logic signed [7:0] w [0:63],
    output logic signed    [21:0] sum
);
    logic signed [15:0] product;

    always_comb begin
        sum = '0;
        for (int i = 0; i < 64; i++) begin
            product = signed'({1'b0, x[i]}) * w[i];
            sum     = sum + 22'(product);
        end
    end
endmodule
