# GitHub Setup Instructions for Private Repository

## 1. Create Private Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `mcp-remote` (or `mcp-remote-fork`)
3. Description: "Fork of mcp-remote with database storage support"
4. **IMPORTANT: Select "Private"** ✅
5. Do NOT initialize with README, .gitignore, or license
6. Click "Create repository"

## 2. Add Remote and Push

After creating the private repository, run these commands:

```bash
# Navigate to the repository
cd "/Users/nishantlamichhane/Documents/Work/project hope/mevio ai/mevio-saas/mcp-remote-fork/mcp-remote-fork"

# Add your private repository as origin
git remote add origin https://github.com/YOUR-USERNAME/mcp-remote.git

# Push the mevio-database branch
git push -u origin mevio-database

# Also push main branch
git push origin main
```

## 3. Set Default Branch (Optional)

In GitHub repository settings:
1. Go to Settings → Branches
2. Change default branch from `main` to `mevio-database`

## 4. Set Up GitHub Package Registry

### Create Personal Access Token
1. Go to https://github.com/settings/tokens/new
2. Note: "mcp-remote npm publish"
3. Expiration: 90 days (or your preference)
4. Select scopes:
   - `write:packages` - Upload packages to GitHub Package Registry
   - `read:packages` - Download packages from GitHub Package Registry
   - `delete:packages` (optional) - Delete packages from GitHub Package Registry
5. Generate token and save it securely

### Configure NPM for Publishing
1. Copy `.npmrc.template` to `.npmrc`:
   ```bash
   cp .npmrc.template .npmrc
   ```

2. Edit `.npmrc` and replace:
   - `YOUR-GITHUB-USERNAME` with your GitHub username
   - `YOUR-TOKEN` with the token you just created

3. Update package.json if needed:
   ```json
   {
     "name": "@YOUR-USERNAME/mcp-remote",
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```

## 5. Publish to GitHub Package Registry

```bash
# Make sure you're on the right branch
git checkout mevio-database

# Build the package
npm run build

# Publish
npm publish
```

## 6. Using the Package

In your main application:

```json
{
  "dependencies": {
    "@YOUR-USERNAME/mcp-remote": "0.1.18-mevio.1"
  }
}
```

With `.npmrc` in your main app:
```
@YOUR-USERNAME:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR-TOKEN
```

## 7. Keeping It Private

- ✅ Repository is private
- ✅ Package is scoped (@YOUR-USERNAME/mcp-remote)
- ✅ Only accessible with GitHub token
- ✅ Can add collaborators through GitHub repository settings

## Security Notes

1. Never commit `.npmrc` with tokens
2. Add `.npmrc` to `.gitignore` (already done)
3. Use GitHub Secrets for CI/CD if needed
4. Tokens should have minimal required permissions

## Repository Management

### Add Collaborators
1. Go to Settings → Manage access
2. Click "Invite a collaborator"
3. They'll need their own token for npm access

### Branch Protection (Optional)
1. Go to Settings → Branches
2. Add rule for `mevio-database`
3. Enable "Require pull request reviews"

Ready to go! 🚀