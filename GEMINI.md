## 1\. Problem Statement

**The Problem:** This system is "trust-by-default" If a malicious update hits NPM, the bot automatically pulls it into the Joplin ecosystem without any human oversight or security scanning.

While frictionless, this "trust-by-default" architecture lacks automated security scanning, human review verification, and traceability back to the developer's original source code. If a compromised or malicious package is published to NPM, it is blindly pulled into the Joplin ecosystem.

The objective of this project is to transition to an "event-driven, verify-by-default" model. This will secure the supply chain and introduce automated malware scanning without sacrificing the Developer Experience (DX) that creators rely on.

* * *

## 2\. Proposed Architecture & Developer Experience (DX)

### **Current State: The NPM-to-Registry Pipeline**

The current publishing flow relies on an automated, polling-based synchronization mechanism:

1.  **Developer Action:** The developer builds their plugin locally and runs `npm publish` to send their code to the public NPM registry.
    
2.  **The Bot (joplin-bot):** A GitHub Action in the `joplin/plugins` repository runs every 30 minutes. It scans NPM for any new versions of packages prefixed with `joplin-plugin-`.
    
3.  **Artifact Transformation:** The bot downloads the data from NPM, extracts the contents, compiles the `.jpl` file, and updates the central `manifests.json` registry.
    
4.  **Distribution (Two-Tier):**
    
    - **Tier 1 (CDN):** The bot uploads the `{id}@{version}.jpl` to the GitHub Releases page.
        
    - **Tier 2 (Fallback):** The bot commits the `.jpl`and local `manifest.json` directly into the `/plugins/{plugin-name}` folder of the repository.
        
5.  **Client Fetching:** The Joplin Desktop app downloads the central `manifests.json` catalog. When a user clicks "Install," the app resolves the download URL , prioritizing the GitHub Release asset before falling back to the raw repository file.

To achieve a secure pipeline while providing a genuinely frictionless Developer Experience (DX), this architecture completely sepetrates Joplin plugin publishing from the public NPM registry. By avoiding NPM entirely.

Instead of the legacy NPM upload, the standard `yo joplin` generator will now include a dedicated publishing script. When a developer is ready to release their plugin, they simply run:

`npm run publish` *(which maps to `joplin-plugin publish`)*

Under the hood, this single command acts as the gateway to the new ecosystem. It automatically runs the build (`npm run dist`), strictly validates the local metadata against Joplin's requirements, authenticates the user via a seamless GitHub Device Flow, and securely transmits the payload directly to the GitHub CI pipeline.

**The Deprecation Hook :**  
We will utilize a friendly Deprecation Script.  
If a developer accidentally types the legacy `npm publish` command out of habit, a `prepublishOnly` hook in the `package.json` will intentionally intercept and stop the NPM upload process before it starts. It will then output a clear, helpful message to the terminal:

> ❌ *As of August 2026, Joplin plugins are no longer published to NPM. Please use `npm run publish` to submit your plugin to the new secure registry.*

This approach safely catches the mistake, teaches the developer the new workflow instantly, and completely avoids the need for complex, fragile CLI interception logic.

**CLI Version Sync:** 
To ensure all developers are using the latest security scanning and metadata validation logic, the `joplin-plugin` CLI will include  a "Hard Gate," preventing submissions from outdated versions until the developer updates to the latest secure release.

### **Identity & Repo Ownership Validation (Anti-Spoofing):**

Authenticating a user locally via the CLI provides a good Developer Experience, but it cannot act as a secure boundary. A malicious dev could bypass the CLI and craft a raw API request to submit an issue. Therefore, the **GitHub Actions CI acts as the absolute trust boundary**.

The moment a submission Issue is opened, the CI runs a strictly isolated API check. It queries the GitHub REST API to confirm that the `github.actor` (the user who triggered the workflow) actively holds `push` or `admin` rights to the repository URL submitted in the Issue. If they do not, the CI immediately halts and closes the submission, completely neutralizing the submissions.

![plugin (1)|634x500, 100%](upload://gLF10VVqNk6pX3ssMdmMAJKdMxu.jpeg)

* * *

## 3\. Security Scanning Pipeline & Tooling Trade-offs (DISCUSSION PHASE)

Once the submission is routed to a GitHub Issue, an event-driven GitHub Actions pipeline instantly wakes up to analyze the developer's repository. Rather than relying on a single security tool, I am proposing a dual-scanner approach to cover both static analysis and supply chain vulnerabilities.


| Tool | Main Strength | Pros | Price|
| --- | --- | --- | --- |
| **Semgrep** | SAST | Fast, easy to maintain custom rules, lightweight CI usage | Unlimited scans/ month free tier |
| **CodeQL** | SAST | Very powerful multi-file vulnerability detection | Unlimited scans/month free tier |
| **Socket.dev** | Supply chain security | Detects malicious packages, typosquatting, install-script abuse | 1000 scan / month free tier|

  
Tools like **SonarQube / deepsource** are code quality first tools which also provide code security. Though it is possible to tune them down to only perform code security they perform almost identical (in many cases below Semgrep) in benchmark testings.  
 **SonarQube / deepsource** provide similar result while also increasing the complexity of the code.

### **CodeQL vs SEMGREP :**

**CodeQL and SEMGREP** are the most closest competitor.  
https://blog.doyensec.com/2022/10/06/semgrep-codeql.html : states how codeQL perform better than semgrep in standard benchmark testing, though also making a lot of false positives + higher execution time. Meanwhile, on a real world code both semgrep and codeql gave 100% detection result, though codeql still generated 2% false positive (things which it detected as threats but were actually not).

### To finalize one tool I ran several tests on already uploaded plugins. These things were followed during the test :

1. The original plugin code was not touched.
2. An additional malicios function containing joplin api was added.
3. Gemini 3 pro Cli was used to cross-check the result and make a human redable final review.
4. Custom rules were applied for both the tools.

##  I. On Bishoy.EmailPlugin (added malicious code): 
A huge list of findings were discovered : https://github.com/akshajrawat/Joplin-tooling-test/actions/runs/25841270500/attempts/1#summary-75927093744

After passing it down to Gemini : 
![Screenshot 2026-05-14 101135|690x346](upload://3o4xyQ3fzYIkEiYow5hANa6ZH7W.png)

**Observation :** Semgrep's findings were very surface level, Only the things for which explicit rules were written were mentioned - but generated very few false positives. 
CodeQL on the other hand gave a very deep and cross file analysis completely outperforming Semgrep - but a lot were false positives
Gemini : Made the review very reviewer friendly. Correctly Identified the false positives and reduced the **35 findings** to human readable 3 findings.

##  II. On joplin-plugin-ToWebSearchEngine (Added malicious code + original): 
Originally there were only 1 False positive threat detected by codeQl : 
![image|414x500](upload://r03klP3O0QSKzrMEXiaB96EDNPW.png)

Gemini : 
![Screenshot 2026-05-14 155701|690x205](upload://sRB5CKPh7D3C01GiWdGoKcLMjcA.png)

After adding the malicious code 29 review were generated : https://github.com/akshajrawat/Joplin-tooling-test/actions/runs/25854832334
Gemini : 
![Screenshot 2026-05-14 161428|690x343](upload://76eg5qi7aVNv4yz9He1P1m9o4I4.png)

**Observation :** Semgrep's findings were on point no noise was generated.
CodeQL on the other hand gave a false positive report though it was easily supressed by Gemini.
Gemini : Correctly Identified the false positive and made the review cleaner in both attempt.

##  III. On joplin-plugin-toggle-highlights-only-display (original) :
Generated review :
![image|404x500](upload://vSWsYGYRN5zyJR4wHPGfC6G8uAe.png)

Gemini report :
![image|690x145](upload://ibgNUUvFwL0qL5MuFXEtWUwPHpg.png)
 
**Observation :** Semgrep's findings were still on point  in finding report related the custom api, no noise was generated.
CodeQL  gave a false positive report.
Gemini : Correctly Identified the false positive and made the review cleaner.

## Conclusion : 
I am proposing to use both `Semgrep` and `codeQl`.
Semgrep is excellent at getting the **severity right** (high/medium/low) and identifying issue related the custom rules - but it is bad at following data across the file.
CodeQl on the other hand is excellent at deep analysis and following the data across the files.
Both the tools compliments each others week point.
The integrated report of these 2 will be a lot messier which will be passed through an LLM to reduce the noise and make it human readable and easy to review.

## For supply chain `Socket.dev` :
**Why Socket.dev ?**
While `Dependabot` and `npm audit` are useful, they are purely database-driven, meaning they only flag known CVEs. Socket.dev encompasses that same CVE database but goes significantly further by proactively analyzing the supply chain for zero-day risks, typosquatting, obfuscated malware, and malicious install scripts which makes it a stronger fit for the proposed plugin review pipeline. Using Socket.dev alone provides comprehensive coverage without adding more tools to the CI pipeline.

Similarly, `Snyk` provides broader dependency and security analysis, but much of its supply-chain scanning still revolves around vulnerability databases and dependency analysis workflows similar to `npm audit`.

The outputs of these scanners are aggregated into a single, readable Markdown report on the GitHub Issue, reducing the load on the human maintainer during review.

### **Use of LLM :**
LLM will be actively used to enhance and make the review report generated more human readable.

|Provider | Top-Tier Model | Justification|
|:-- | :-- | :--|
|**OpenAI** | **GPT-5.5** | Specifically for coding and professional work.|
|**Anthropic** | **Claude Opus 4.7** | The highest-tier model in the 4.x family, designed for the most complex reasoning tasks.|
|**Google** | **Gemini 3.1 Pro Preview** | Optimized for multimodal understanding and "vibe-coding" with the highest reasoning capabilities in the Gemini family.|

## Costing based on 50 review per week :

| Metric | Claude Opus 4.7 | OpenAI GPT-5.5 | Gemini 3.1 Pro |
| :--- | :--- | :--- | :--- |
| **Input Price / 1M** | \$5.00 | \$5.00 | **\$2.00** |
| **Output Price / 1M** | \$25.00 | \$30.00 | **\$12.00** |
| **Estimated Monthly Cost (50 review/ week)** | \$23.27 | \$23.60 | **\$9.44** |

For maximum reasoning depth where timing is irrelevant, **Gemini 3.1** Pro Preview provides the highest intelligence-to-cost ratio in this dataset. It offers the same frontier-level performance for roughly 60% less cost than GPT-5.5 or Claude Opus 4.7.

### **YAML-Based Issue Forms**

To avoid the fragility of parsing free-form Markdown, the submission CLI will utilize **GitHub Issue Templates**. This allows the CI to extract metadata (Repository URL, Commit Hash, Plugin ID) as structured JSON objects, ensuring 100% parsing accuracy and preventing "malformed issue" errors.

### **Update Lifecycle**

When a developer submits a version update, the pipeline performs a **Comprehensive Scan** of the full codebase at the new commit. While the automated report highlights the **Differential Changes** (the delta between the `approved_commit` and the new submission) as a convenience to the reviewer, the security scan itself is always executed across the entire repository. This ensures that cross-file vulnerabilities... where malicious logic is split between previously approved code and new updates are fully detected. By surfacing the delta separately, the load on the human maintainer is reduced, allowing for a rapid, focused review of routine version bumps.

* * *

## 4\. Approval, Registry Mutation, and UI Integration

Automated scanning alone cannot prevent targeted attacks if a bad actor updates their logic to bypass static analysis. Therefore, human review remains the final gatekeeper.

Once a Joplin maintainer reviews the automated Markdown report, they approve the plugin by applying a specific **GitHub Label** (e.g., `status: approved`) to the Issue.

The build workflow will be kept in an group to prevent concurrency :

```yaml
concurrency:
  group: global-joplin-registry-mutation
  cancel-in-progress: false
```

Applying the label triggers a secure GitHub Action that perfectly replicates the current `joplin-bot` distribution, ensuring zero disruption to the desktop client's resolution strategy. The Action will:

### **The Split-job Trust Boundary:**

Running untrusted, third-party build scripts (like `webpack` via `npm run dist`) inside a privileged CI runner introduces a severe Remote Code Execution (RCE) risk. A malicious script could access the `GITHUB_TOKEN` and corrupt the registry. To prevent this, the architecture uses a strictly isolated **Split-job**:

1.  **The Sandbox (Unprivileged Build):** When the `status: approved` label is applied, a completely unprivileged runner (`permissions: read-all`) clones the approved commit. It runs `npm ci` and builds the `.jpl` file in isolation. If a malicious script runs, it is trapped with no secrets to steal. The runner uploads the `.jpl` as a temporary GitHub Artifact.
    
5.  **The Publisher (Privileged Mutation):** A second, completely  job wakes up. It downloads the static `.jpl` artifact, validates its integrity, and pushes it to the GitHub Releases CDN .
    
6.  **Registry Mutation (Via REST API):** Finally, the Publisher workflow uses the GitHub REST API to inject the `.jpl` and the updated `manifest.json` directly into the `joplin/plugins` master branch. This avoids full repository clones and prevents `git push` race conditions.
    

Finally, to make this security model meaningful to the end-user, the Joplin Desktop UI will be updated. Plugins marked as `reviewed` in the registry will display a "Verified Shield" badge within the app.

### **Handling Compromised Plugins (Automated Obsoletion):**

Currently, marking a plugin as obsolete requires a maintainer to manually cut JSON blocks from `manifests.json`, paste them into `manifestOverrides.json`, append new keys, run a linter, and open a PR.

To improve maintainer DX in the event of a security breach, the pipeline will automate this existing mechanism. If a maintainer applies a `status: revoked` label to a plugin's GitHub Issue, a GitHub Action will automatically handle the JSON file mutations, append the `"_obsolete": true` flag, and commit the changes to remove the plugin from the app's search results and protect users' local environments.

### **Handling Security Reports:**

Right now, if someone finds a security flaw in an old plugin, it's hard to report it.  
To fix this, we will automatically add an emergency contact file (`SECURITY.md`) to all new plugins. This file will tell security researchers to report flaws directly to the Joplin core team instead of the individual developers. If a critical threat is reported, maintainers can instantly apply the `status: revoked` label.

### **Error Handling & CI Failure Recovery**

Because this architecture is highly event-driven, we must account for failures.

To ensure maintainers can easily recover from these failures without requiring developers to resubmit their plugins, the architecture relies on two recovery mechanisms:

1.  **Native Job Re-runs:** For standard failures, maintainers will utilize GitHub's native "Re-run failed jobs" button. Because the workflow context is preserved, the CI will re-evaluate the original Issue payload or Label event without requiring any manual data entry.
    
3.  **Manual Override (`workflow_dispatch`):** To protect against outages where an event trigger is completely dropped by GitHub, both the Review CI and Approval CI workflows will include a `workflow_dispatch` hook. This provides maintainers with a manual "Run Workflow" button in the GitHub UI, allowing them to explicitly trigger a scan or approval by manually inputting the target GitHub Issue number.
    

* * *

## 5\. Legacy Plugin Migration Strategy

With hundreds of active plugins, breaking existing workflows or delisting developers is not an option. Existing plugins will be kept into the registry with an `unreviewed` status. They will function normally but will not receive the Verified Badge in the UI.

### **Bulk Review Migration (as an option) :**

We must secure the existing ecosystem without waiting for developers to manually push version bumps. Once the new pipeline demonstrates stability, a one-time script will automatically pull all currently active plugins from the NPM registry and push them through the new security CI, generating a structured backlog of GitHub Issues.

This allows the maintainer team to systematically review and grant the "Verified Badge" to the existing ecosystem. Once the backlog is processed and the ecosystem is secured, the legacy NPM-polling cron job will be fully deprecated and removed.

#### **Namespace Locking (Immutable Identity Verification):**

To prevent namespace squatting, where a bad actor attempts to claim an existing plugin's  the CI enforces a strict check before updates.

Every plugin entry in `manifests.json` already contains a `repository_url` field pointing to the developer's source repository. When a submission arrives claiming an existing plugin ID, the CI calls the GitHub API on the submitted repository and reads the owner's permanent numeric ID. It then compares this against the numeric ID of the owner stored against the registered `repository_url` in the existing manifest entry. If the IDs do not match, the submission is immediately rejected and the issue is closed automatically.

Because numeric IDs are permanent at the account level , unlike usernames or repository URLs  this check remains correct even if the developer renames their GitHub account or renames their repository. The ID never changes, so legitimate owners are never locked out, and bad actors are  blocked regardless of what name or repository they use.

Edge case : There are plugins with missing `homepage_url` and `repository_url` which would means failing of authentication. To solve this we will before deploying the new pipeline run a step 0, finding all the plugin that miss repository URL , and query the NPM using their `_npm_package_name` to get the  linked repository URL.

### **Migration Gap (Existing Developers) :**

The `prepublishOnly` deprecation hook perfectly protects new plugins, but it cannot update the `package.json` of existing developers. For the migration period, we will rely on ecosystem-wide communication (forum announcements, updated documentation).

However, the ultimate failsafe is the deprecation of the cron job itself. Once the Bulk Review Migration is complete and the legacy NPM-polling cron job is turned off, the old NPM pipeline is effectively dead. If a legacy developer misses the announcements and types `npm publish`, their code will simply sit on the NPM registry and will *not* be ingested by Joplin. When they realize their plugin isn't updating in the app, they will check the documentation, discover the new `joplin-plugin publish` CLI, and securely submit their update, naturally moving them into the new verify-by-default pipeline.

* * *

## 6\. Conclusion: The Complete End-to-End Lifecycle :

To summarize how this architecture transforms the ecosystem, here is the complete journey of a plugin from the developer's computer to the end-user's application once this project is implemented:

When a developer finishes coding, they simply run `npm run publish` in their terminal.

The local CLI takes over, verifying the build data and authenticating the user before securely submitting the plugin's metadata to our repository as a GitHub Issue.

This instantly triggers the automated CI pipeline, which scans the repository using the tools, passing the findings through an LLM to  generate a clean Markdown report.

A human maintainer reviews this report and simply applies a `status: approved` GitHub label. This label triggers a final GitHub Action that securely rebuilds the `.jpl` file in an isolated environment, uploads it to GitHub Releases, and automatically updates the central `manifests.json` and the `plugins/{plugin_name}` with `.jpl` and local `manifest.json` registry via API.

An end-user opens their Joplin Desktop app, sees the newly published plugin with a "Verified Shield" badge, and installs it natively, knowing the code has been thoroughly checked and secured.