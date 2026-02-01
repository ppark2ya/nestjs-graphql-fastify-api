#!/bin/bash

# Create keys directory if it doesn't exist
mkdir -p keys

# Generate Private Key
openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048

# Generate Public Key
openssl rsa -pubout -in keys/private.pem -out keys/public.pem

echo "✅ RS256 Keys generated successfully in keys/ directory"
