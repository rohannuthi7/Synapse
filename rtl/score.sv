module score (
    input  var logic              x [0:63],
    input  var logic signed [7:0] w [0:63],
    output logic signed    [15:0] sum
);
    logic signed [15:0] weight;

    always_comb begin
        sum = '0;
        for (int i = 0; i < 64; i++) begin
            weight = w[i];
            sum    = sum + (x[i] ? weight : '0);
        end
    end
endmodule
