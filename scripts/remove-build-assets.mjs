import { rmSync } from 'node:fs';
import { join } from 'node:path';

const removableFiles = [
  join(process.cwd(), 'build', 'strings.conf'),
];

for (const file of removableFiles) {
  rmSync(file, { force: true });
}
