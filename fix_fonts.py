import os, glob, re
for f in glob.glob('src/**/*.jsx', recursive=True):
    with open(f, 'r') as file:
        content = file.read()
    content = re.sub(r'\bfont-(bold|semibold|extrabold|medium)\b', '', content)
    with open(f, 'w') as file:
        file.write(content)
