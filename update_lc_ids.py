import glob
import re
import os

files = glob.glob('app/data/light-cones/*.ts')

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Regex to find id property
    def replace_id(match):
        full_match = match.group(0)
        id_value = match.group(1)
        if '_' in id_value:
            new_id = id_value.replace('_', '-')
            # Also need to check if filename matches?
            # User wants kebab-case IDs.
            # Assuming file naming is already kebab-case (mostly true except the ones I renamed).
            print(f"Updating {file_path}: {id_value} -> {new_id}")
            return f"id: '{new_id}'"
        return full_match

    new_content = re.sub(r"id:\s*'([a-z0-9_]+)'", replace_id, content)
    # Also handle double quotes if any
    new_content = re.sub(r'id:\s*"([a-z0-9_]+)"', replace_id, new_content)

    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
