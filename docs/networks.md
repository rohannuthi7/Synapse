# Neural Network Project Overview

**Author:** Rohan Nuthi
**Date:** 10/17/2026

## Overview

We want to build an extremely quick portable neural network and explore its applications in the real world.

**Current plan:** We are going to design 2 different neural networks and compare their performance against one another.

The Von Neumann path now in RTL scores one digit at a time. Each cell is an unsigned brightness, 0 through 255, multiplied by a signed 8-bit weight. The product is 16 bits. The sum of the 64 products is 22 bits, then sign-extended to a 32-bit integer for the UART result. The threshold-and-spike description below is the earlier plan.

## How the Networks Work

The networks take input spikes corresponding to where brightness values fall below a certain threshold on the specific pixel. This triggers a spike to that pixel's neuron in the corresponding neural network. As a result, the neuron's weights activate and process the spikes to produce an output corresponding to the likelihood of the number that the weight map is meant for to have been in the photo. This is performed on all digits 0-9. The number with the greatest likelihood is selected to be the perceived number.

## Design 1: Von Neumann (VN)

The first network is a Von Neumann inspired neural network. Weights for the neurons are stored in memory, and when multiplying the inputs by the weights, numbers are multiplied in an ALU, and results are stored back into memory.

- **Pros:** Works best for backpropagation, as weights are easy to update in memory itself
- **Cons:** Reading from and writing back to memory is slow

## Motivation: Computing Like the Brain

The brain's visual identification skills perform significantly quicker for the same amount of energy than traditional Von Neumann computers. One of the biggest reasons why is that the weights for neurons in the brain aren't pulled from memory, multiplied, and then written back into memory. The signal is multiplied by the electrical and chemical properties of the neurons and synapses themselves.

For example, take someone pushing a ball to accelerate it. The ball does not calculate its acceleration based on the force being applied and its mass before accelerating to the proper m/s². It simply acts as a result of physical action. Similarly, the weights aren't multiplied onto neuron inputs using math but by physics. Therefore, the second neural network strategy employs a similar method to near-instantly replicate the image identification process.

## Design 2: Neuromorphic (NM)

Weights for the neurons are not necessarily stored, but held in the voltage of the wire. A resistor applies a "weight" to the inputted voltage, bypassing the typical read and write from memory needed. Processing an image can be finished in near-instant time. However, the single biggest challenge with this design is the fact that resistor resistances are hard to change once set, removing the ability to adjust the weights frequently to fine-tune the neural network.

- **Pros:** Extremely quick
- **Cons:** Hard to train weights for accuracy improvements, making backpropagation difficult

## Summary and Approach

As a result, things look like this: VN is slow but easy to train, NM is fast but hard to train. Our current approach is therefore to build a VN first and train it to get an accurate weight map. Then, we can reuse this weight map for the NM, benefiting from the training speed of the VN and the processing speed of the NM.