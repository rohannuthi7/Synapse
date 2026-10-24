import os

# get_board() picks its board once, at first use. Pin it to the emulator
# before any test imports the app, so a SYNAPSE_SERIAL_PORT left set in a
# developer's shell never sends test traffic to real hardware.
os.environ["SYNAPSE_BOARD"] = "emulated"
