async function getMetadataAndPdf() {
    try {
        const searchType = document.getElementById('searchType').value;
        const searchInput = document.getElementById('searchInput').value;
        
        // 第一步：搜索 metadata
        const query = `
            query {
                transactions(
                    tags: [
                        { name: "App-Name", values: ["scivault"] },
                        { name: "Content-Type", values: ["application/json"] },
                        { name: "Version", values: ["1.0.3"] },
                        { name: "${searchType}", values: ["${searchInput}"] }
                    ],
                    first: 100
                ) {
                    edges {
                        node {
                            id
                            tags {
                                name
                                value
                            }
                        }
                    }
                }
            }
        `;

        const response = await fetch('https://uploader.irys.xyz/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();
        const metadataNodes = result.data?.transactions?.edges || [];
        
        // 第二步：从 metadata 中提取所有 DOI
        const dois = metadataNodes.map(edge => 
            edge.node.tags.find(tag => tag.name === 'doi')?.value
        ).filter(doi => doi);

        // 第三步：用 DOI 查询对应的 PDF
        const pdfMap = new Map();
        if (dois.length > 0) {
            const pdfQuery = `
                query {
                    transactions(
                        tags: [
                            { name: "App-Name", values: ["scivault"] },
                            { name: "Content-Type", values: ["application/pdf"] },
                            { name: "Version", values: ["1.0.1"] },
                            { name: "doi", values: ${JSON.stringify(dois)} }
                        ],
                        first: 100
                    ) {
                        edges {
                            node {
                                id
                                tags {
                                    name
                                    value
                                }
                            }
                        }
                    }
                }
            `;

            const pdfResponse = await fetch('https://uploader.irys.xyz/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: pdfQuery })
            });

            const pdfResult = await pdfResponse.json();
            
            // 将 PDF ID 存入 Map，以 DOI 为键
            for (const edge of pdfResult.data?.transactions?.edges || []) {
                const tags = edge.node.tags;
                const doi = tags.find(tag => tag.name === 'doi')?.value;
                if (doi) pdfMap.set(doi, edge.node.id);
            }
        }

        // 第四步：处理元数据并关联 PDF
        const papers = [];
        for (const edge of metadataNodes) {
            const id = edge.node.id;
            const metadataResponse = await fetch(`https://gateway.irys.xyz/${id}`);
            const paper = await metadataResponse.json();
            const doi = edge.node.tags.find(tag => tag.name === 'doi')?.value;
            paper.pdfId = pdfMap.get(doi) || null;
            papers.push(paper);
        }
        
        return papers;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

async function search() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p>Searching...</p>';
    
    const papers = await getMetadataAndPdf();
    if (!papers || !Array.isArray(papers)) {
        resultsDiv.innerHTML = '<p>Cannot load paper index</p>';
        return;
    }
    
    if (papers.length === 0) {
        resultsDiv.innerHTML = '<p>No matching papers found</p>';
        return;
    }
    
    resultsDiv.innerHTML = papers.map(paper => `
        <div class="paper-item">
            <div class="paper-title">${paper.title || 'No title available'}</div>
            <div class="paper-info">DOI: ${paper.doi || 'No DOI available'}</div>
            <div class="paper-info">arXiv ID: ${paper.aid || 'No arXiv ID available'}</div>
            <div class="paper-info">Transaction ID: ${paper.id || 'No TX ID available'}</div>
            <div class="paper-authors">Authors: ${paper.authors || 'No authors available'}</div>
            <div class="paper-abstract">
                <strong>Abstract:</strong><br>
                ${paper.abstract || 'No abstract available'}
            </div>
            <div class="paper-actions">
                ${paper.pdfId 
                    ? `<button class="pdf-button available" onclick="window.open('https://gateway.irys.xyz/${paper.pdfId}', '_blank')">View PDF</button>`
                    : `<button class="pdf-button disabled" disabled>PDF Not Available</button>`
                }
            </div>
        </div>
    `).join('');
} 