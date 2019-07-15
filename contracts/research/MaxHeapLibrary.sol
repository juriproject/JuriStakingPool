pragma solidity 0.5.10;

import "../lib/SafeMath.sol";

library MaxHeapLibrary {
    using SafeMath for uint256;

    /*
    // The main operations of a priority queue are insert, delMax, & isEmpty.
    constructor() public {
        // Start at 0
        heap = [0];
    }
    */

    struct MaxHeapEntry {
        address node;
        uint256 value;
    }

    struct heapStruct {
        MaxHeapEntry[] elements;
    }

    // Inserts adds in a value to our heap.
    function insert(heapStruct storage heap, address _node, uint256 _value) public {
        MaxHeapEntry memory newEntry = MaxHeapEntry(_node, _value);

        // Add the value to the end of our array
        heap.elements.push(newEntry);
        // Start at the end of the array
        uint256 currentIndex = heap.elements.length.sub(1);

        // Bubble up the value until it reaches it's correct place (i.e. it is smaller than it's parent)
        while(currentIndex > 1 && heap.elements[currentIndex.div(2)].value < heap.elements[currentIndex].value) {
            // If the parent value is lower than our current value, we swap them
            MaxHeapEntry memory entry1 = heap.elements[currentIndex.div(2)];
            heap.elements[currentIndex.div(2)] = newEntry;
            heap.elements[currentIndex] = entry1;

            // change our current Index to go up to the parent
            currentIndex = currentIndex.div(2);
        }
    }

    // RemoveMax pops off the root element of the heap (the highest value here) and rebalances the heap
    function removeMax(heapStruct storage heap) public returns (MaxHeapEntry storage){
        // Ensure the heap exists
        require(
            heap.elements.length > 1,
            "There are no elements in the heap to remove!"
        );
        // take the root value of the heap
        MaxHeapEntry storage toReturn = heap.elements[1];

        // Takes the last element of the array and put it at the root
        heap.elements[1] = heap.elements[heap.elements.length.sub(1)];
        // Delete the last element from the array
        heap.elements.length = heap.elements.length.sub(1);
    
        // Start at the top
        uint256 currentIndex = 1;

        // Bubble down
        while(currentIndex.mul(2) < heap.elements.length.sub(1)) {
            // get the current index of the children
            uint256 j = currentIndex.mul(2);

            // left child value
            uint256 leftChild = heap.elements[j].value;
            // right child value
            uint256 rightChild = heap.elements[j.add(1)].value;

            // Compare the left and right child. if the rightChild is greater, then point j to it's index
            if (leftChild < rightChild) {
                j = j.add(1);
            }

            // compare the current parent value with the highest child, if the parent is greater, we're done
            if(heap.elements[currentIndex].value > heap.elements[j].value) {
                break;
            }

            // else swap the value
            MaxHeapEntry memory entry1 = heap.elements[currentIndex];
            heap.elements[currentIndex] = heap.elements[j];
            heap.elements[currentIndex.div(2)] = entry1;

            // and let's keep going down the heap
            currentIndex = j;
        }

        // finally, return the top of the heap
        return toReturn;
    }


    function getHeap(heapStruct storage heap) public view returns(MaxHeapEntry[] storage) {
        return heap.elements;
    }

    function getMax(heapStruct storage heap) public view returns(MaxHeapEntry storage) {
        return heap.elements[1];
    }

    function getLength(heapStruct storage heap) public view returns(uint256) {
        return heap.elements.length;
    }
}