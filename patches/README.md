# Patches

This directory contains git patches for syncing changes between repository forks.

## Applying Patches

Apply patches in numerical order:

```bash
git apply patches/001-*.patch
git apply patches/002-*.patch
# etc.
```

After applying each patch, log it:

```bash
echo "$(date '+%Y-%m-%d %H:%M') | 001-patch-name.patch | applied" >> patches/APPLIED.md
```

## If a Patch Fails

Try with `--3way` for conflict resolution:

```bash
git apply --3way patches/001-*.patch
```

Or check what would happen without applying:

```bash
git apply --check patches/001-*.patch
```

## Creating New Patches

After committing a change you want to share:

```bash
git format-patch -1 HEAD -o patches/
```

Rename to include sequence number:

```bash
mv patches/0001-*.patch patches/XXX-descriptive-name.patch
```

## Files

- `*.patch` - Git format-patch files
- `APPLIED.md` - Log of which patches have been applied
- `README.md` - This file
