import json
transcript = '/Users/sushankarki/.gemini/antigravity-ide/brain/dede9b51-3af3-4bdd-99ef-73f9c31d7a36/.system_generated/logs/transcript_full.jsonl'
for line in open(transcript):
    if 'File Path:' in line:
        try:
            data = json.loads(line)
            content = data.get('content', '') or data.get('output', '')
            if 'File Path:' in content:
                for l in content.split('\\n'):
                    if l.startswith('File Path:'):
                        print(l)
        except:
            pass
