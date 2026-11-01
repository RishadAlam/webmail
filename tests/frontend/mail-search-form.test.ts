import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    readSearchFields,
    writeSearchQuery,
} from '../../resources/js/lib/mail-search-form.ts';

await test('search fields retain quoted literals, repeated conditions and unrecognized operators', () => {
    const fields = readSearchFields(
        'from:alex from:team subject:"weekly notes" "status:open" is:starred larger:10',
        'all',
        false,
    );
    assert.equal(fields.from, 'alex');
    assert.equal(fields.subject, 'weekly notes');
    assert.equal(fields.query, 'from:team "status:open" is:starred larger:10');
    assert.equal(
        writeSearchQuery(fields),
        'from:team "status:open" is:starred larger:10 from:"alex" subject:"weekly notes"',
    );
});

await test('field values cannot add search operators through quotes or backslashes', () => {
    const fields = readSearchFields('', 'all', false);
    fields.subject = 'Weekly "review" \\ in:trash';
    fields.from = 'A Person';
    const query = writeSearchQuery(fields);
    const restored = readSearchFields(query, 'all', false);
    assert.equal(restored.subject, fields.subject);
    assert.equal(restored.from, fields.from);
    assert.equal(restored.scope, 'all');
    assert.equal(restored.query, '');
    fields.subject = ' padded phrase ';
    assert.equal(
        readSearchFields(writeSearchQuery(fields), 'all', false).subject,
        fields.subject,
    );
});

await test('search fields restore scope, attachments, unread and valid date ranges', () => {
    const fields = readSearchFields(
        'in:archive has:attachment is:unread after:2026-10-01 before:2026-11-01 label:"Client work"',
        'all',
        false,
    );
    assert.equal(fields.scope, 'archive');
    assert.equal(fields.attachments, true);
    assert.equal(fields.unread, true);
    assert.equal(fields.after, '2026-10-01');
    assert.equal(fields.before, '2026-11-01');
    assert.equal(fields.label, 'Client work');
    assert.equal(fields.query, '');
    assert.equal(
        writeSearchQuery(fields),
        'label:"Client work" after:2026-10-01 before:2026-11-01 has:attachment',
    );
});

await test('malformed queries remain editable and retain server validation', () => {
    for (const query of [
        'from:"unfinished',
        'from:""',
        'in:inbox in:trash',
        'in:all in:drafts',
        'from:alex\tto:team',
        `${Array.from({ length: 23 }, () => 'a').join(' ')} is:unread is:unread`,
        `from:${'a'.repeat(195)} is:unread`,
    ]) {
        const fields = readSearchFields(query, 'all', false);
        assert.equal(fields.query, query);
        assert.equal(writeSearchQuery(fields), query);
    }
    const fields = readSearchFields(
        'after:2026-02-31 before:tomorrow',
        'all',
        false,
    );
    assert.equal(fields.query, 'after:2026-02-31 before:tomorrow');
    assert.equal(fields.after, '');
    assert.equal(fields.before, '');
});

await test('Unicode whitespace remains part of the search value as it does on the server', () => {
    const fields = readSearchFields('from:alex\u00a0to:team', 'all', false);
    assert.equal(fields.from, 'alex\u00a0to:team');
    assert.equal(fields.to, '');
    const literal = '\u00a0weekly\u00a0';
    assert.equal(
        writeSearchQuery(readSearchFields(literal, 'all', false)),
        literal,
    );
});
