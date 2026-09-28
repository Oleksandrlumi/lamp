// Set the admin login. Prompts for a username and password, stores only a
// scrypt hash of the password in .env and prints the values for your hosting.
//   npm run set-admin
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server/auth.js';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write('*'.repeat(s.length ? 1 : 0));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const username = (await ask('Логін адміна: ')).trim();
const password = await ask('Пароль (мін. 12 символів): ', { hidden: true });
const repeat = await ask('Повторіть пароль: ', { hidden: true });

if (username.length < 3) throw new Error('Логін занадто короткий');
if (password.length < 12) throw new Error('Пароль має містити щонайменше 12 символів');
if (password !== repeat) throw new Error('Паролі не збігаються');

const hash = await hashPassword(password);
const values = { ADMIN_USER: username, ADMIN_PASSWORD_HASH: hash };

const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split('\n') : [];
const kept = lines.filter((l) => l && !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
const quote = (v) => `'${v.replace(/'/g, '')}'`;
fs.writeFileSync(envFile, [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${quote(v)}`)].join('\n') + '\n', { mode: 0o600 });

console.log('\n✓ Збережено в .env (пароль зберігається лише як хеш).');
console.log('Для хостингу додайте ці змінні середовища:\n');
for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
console.log('\nПерезапустіть сервер, щоб зміни набули чинності.');
