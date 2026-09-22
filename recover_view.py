import json

transcript = '/Users/sushankarki/.gemini/antigravity-ide/brain/dede9b51-3af3-4bdd-99ef-73f9c31d7a36/.system_generated/logs/transcript_full.jsonl'

file_contents = {}

with open(transcript, 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '') or data.get('output', '')
            if 'Total Bytes:' in content and 'File Path:' in content:
                path = ''
                for l in content.split('\n'):
                    if l.startswith('File Path:'):
                        path = l.split('`')[1].replace('file://', '').replace('%20', ' ')
                        break
                
                if path.endswith('.jsx'):
                    if path not in file_contents:
                        file_contents[path] = {}
                    
                    for l in content.split('\n'):
                        if l.find(': ') > 0:
                            num_part = l.split(': ')[0]
                            if num_part.isdigit():
                                file_contents[path][int(num_part)] = l[len(num_part)+2:]
        except Exception as e:
            pass

for path, lines_dict in file_contents.items():
    max_line = max(lines_dict.keys())
    recovered_lines = []
    for i in range(1, max_line + 1):
        recovered_lines.append(lines_dict.get(i, ''))
    
    with open(path, 'w') as out:
        out.write('\n'.join(recovered_lines))
    print(f"Fully Recovered {path} with {len(recovered_lines)} lines")

