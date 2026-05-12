const BASE = 'http://localhost:11434';
const MODEL = 'qwen2.5vl:3b';

export async function checkConnection() {
    try {
        const res = await fetch(`${BASE}/api/tags`);
        if (!res.ok) return { ok: false, error: 'Ollama responded with an error' };
        const data = await res.json();
        const hasModel = data.models?.some(m => m.name.startsWith('qwen2.5vl'));
        return {
            ok: true,
            hasModel,
            models: data.models?.map(m => m.name) || []
        };
    } catch {
        return { ok: false, error: 'Cannot reach Ollama at localhost:11434' };
    }
}

export async function describe(base64Image, prompt, onChunk) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const res = await fetch(`${BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [{
                    role: 'user',
                    content: prompt,
                    images: [base64Image]
                }],
                stream: true
            }),
            signal: controller.signal
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Ollama error (${res.status}): ${text}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                        accumulated += json.message.content;
                        onChunk(json.message.content, accumulated);
                    }
                } catch {
                    // skip malformed lines
                }
            }
        }

        return accumulated;
    } finally {
        clearTimeout(timeout);
    }
}
