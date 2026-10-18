- Rohan Nuthi
- 10/17/2026

We want to build an extremely quick portable neural network and explore its applications in the real-world.

Current plan: We are going to design 2 different neural networks and compare their performance against one another.

The networks take input spikes corresponding to where brightness values fall below a certain threshold on the specific pixel. This triggers a spike to that pixels neuron in the corresponding neural network. As a result, the neurons weights activate and process the spikes to produce an output corresponding to the likelihood of the number that the weight map is meant for to have been in the photo. This is performed on all digits 0-9. The number with the greatest likelihood is selected to the be the perceived number.

Von-Neumann Design (VN):
The first network is a von-neumann neural inspired neural network. Weights for the neurons are stored in memory, and when multiplying the inputs by the weights, numbers are multiplied in an ALU, and resutls are stored back into memory.

Pros: Works best for backpropogation as weights are easy to update in memory itself
Cons: Reading from and writing back to memory is slow

The brain's visual identification skills perform significantly quicker for the same amount of energy than traditional von-neumann computers. On the biggest reasons why is that the weights for neurons in the brain aren't pulled from memory and multiplied, and then written back into memory. The signal is multiplied by the electrical and chemical properties of the neurons and synapses themselves.

For example, take some pushing a ball to accelerate it. The ball does not calculate it's acceleration based on the force being applied and its mass, before accelerating to the proper m/s^2. It simple acts as a result of physical action. Similarly, the weights aren't multiplied onto neuron inputs using math but by physics. Therefore, the second neural network strategy employs a similar method to near-instantly replicate the image identification process.

Neuromorphic Design (NM):
Weights for the neurons are not necessarily stored, but held in the voltage of the wire. A resistor applies a "weight" to the inputted voltage, bypassing the typical read and write from memory needed. Processing an image can be finished in near-instant time. However, the single biggest challenge with this design is the fact that resistor resistances are hard to change once set, removing the ability to adjust the weights frequently to fine-tune the neural network.

Pros: Extremely quick
Cons: Hard to train weights for accuracy improvements making backpropogation difficult

As a result, things look like this: VN is slow but easy to train, NM is fast but hard to train. Our current approach is therefore is build a VN first, train this VN to get an accurate weight map. Then, we can reuse this weight map for the NM, benefiting from the training speed of the VN and processing speed of the NM.