#!/bin/bash

# Get the absolute path of the directory where THIS script lives
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Define source and destination relative to the script location
# (Example: copying a folder named "data" inside the script's folder to a "backup" folder)
SOURCE_DIR="$SCRIPT_DIR/../shafiart"
DEST_DIR="$SCRIPT_DIR/../../public_html"

# Check if the source directory exists
if [ -d "$SOURCE_DIR" ]; then
    echo "Script location: $SCRIPT_DIR"
    echo "Copying from: $SOURCE_DIR"
    echo "Copying to:   $DEST_DIR"
    
    # Ensure parent destination directory exists
    mkdir -p "$(dirname "$DEST_DIR")"
    
    # Perform the copy
    cp -a "$SOURCE_DIR" "$DEST_DIR"
    
    if [ $? -eq 0 ]; then
        echo "Success: Folder copied successfully!"
        mv "${DEST_DIR}/shafiart/editor.html" "${DEST_DIR}/shafiart/index.htm"
        cp "${SCRIPT_DIR}/copyright.php" "${DEST_DIR}/shafiart/"
    else
        echo "Error: Copy failed." >&2
        exit 1
    fi
else
    echo "Error: Source directory $SOURCE_DIR does not exist." >&2
    exit 1
fi



