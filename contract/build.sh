#!/bin/sh

echo ">> Building contract"

near-sdk-js build src/contract.ts build/nft-k10.wasm
