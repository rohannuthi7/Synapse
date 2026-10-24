# 50 MHz board clock. 20 ns is 1 / 50e6.
create_clock -name clk -period 20.000 [get_ports clk]
