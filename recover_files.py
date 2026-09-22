import json
import os

transcript = '/Users/sushankarki/.gemini/antigravity-ide/brain/dede9b51-3af3-4bdd-99ef-73f9c31d7a36/.system_generated/logs/transcript_full.jsonl'
files = {}

with open(transcript, 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'SYSTEM' and 'File Path:' in data.get('content', ''):
                content = data['content']
                path = ""
                for content_line in content.split('\n'):
                    if content_line.startswith('File Path:'):
                        path = content_line.split('`')[1].replace('file://', '').replace('%20', ' ')
                        break
                
                if path and "Zum Form" in path:
                    file_lines = []
                    for l in content.split('\n'):
                        if l.find(': ') > 0:
                            num_part = l.split(': ')[0]
                            if num_part.isdigit():
                                file_lines.append(l[len(num_part)+2:])
                    if len(file_lines) > 0:
                        files[path] = '\n'.join(file_lines)
        except Exception as e:
            pass

for p, c in files.items():
    print(f"Recovered {p} with {len(c.splitlines())} lines")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as out:
        out.write(c)
