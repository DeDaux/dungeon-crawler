// Quick test of DeepSeek API connectivity
const KEY = process.env.DEEPSEEK_API_KEY || 'sk-9054e8fd0926429b80a407e2461b4a91';

async function test() {
    console.log('Testing DeepSeek API...');
    console.log('Key prefix:', KEY.slice(0, 12) + '...');
    console.log('Auth header:', 'Bearer ' + KEY.slice(0, 12) + '...');

    // Try multiple base URLs
    const bases = [
        'https://api.deepseek.com',
        'https://api.deepseek.com/v1',
    ];

    for (const base of bases) {
        const url = `${base}/chat/completions`;
        console.log(`\nTrying: ${url}`);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: 'Say just "OK" and nothing else.' }],
                    max_tokens: 20,
                }),
            });
            const text = await resp.text();
            console.log(`Status: ${resp.status}`);
            console.log(`Response: ${text.slice(0, 500)}`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

test().catch(e => console.error('Test failed:', e));