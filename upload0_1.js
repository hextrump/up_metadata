require("dotenv").config();
const { Uploader } = require("@irys/upload");
const { Solana } = require("@irys/upload-solana");
const fs = require("fs");
const path = require("path");
const readline = require('readline');

const getIrysUploader = async () => {
    try {
        const irysUploader = await Uploader(Solana).withWallet(process.env.PRIVATE_KEY);
        console.log("Irys uploader initialized.");
        return irysUploader;
    } catch (error) {
        console.error("Failed to initialize Irys uploader:", error);
        return null;
    }
};

const processChunkFile = async (filePath) => {
    const papers = [];
    let lineCount = 0;
    
    console.log(`Processing chunk file: ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        lineCount++;
        if (line.trim()) {
            try {
                const paper = JSON.parse(line.trim().replace(/,$/, ''));
                if (paper.doi && paper.title && paper.aid) {
                    papers.push(paper);
                }
            } catch (e) {
                console.error(`Error parsing line ${lineCount} in ${filePath}:`, e.message);
            }
        }
    }

    console.log(`Finished reading chunk. Found ${papers.length} papers`);
    return papers;
};

const PROCESS_UNTIL_CHUNK = 122;
const CHUNK_DIR = "D:\\download\\cutmeta\\split_files";

const uploadMetadata = async () => {
    const irys = await getIrysUploader();
    if (!irys) {
        console.error("Irys uploader could not be initialized.");
        return;
    }

    try {
        for (let chunkNum = 1; chunkNum <= PROCESS_UNTIL_CHUNK; chunkNum++) {
            const chunkPath = path.join(CHUNK_DIR, `chunk_${chunkNum}.json`);
            console.log(`\nProcessing chunk file: ${chunkPath}`);
            
            const papers = await processChunkFile(chunkPath);
            console.log(`Loaded ${papers.length} papers for processing`);

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < papers.length; i++) {
                const paper = papers[i];
                console.log(`\n📄 Processing paper [${i + 1}/${papers.length}]`);

                if (!paper.doi) {
                    console.log(`⚠️ Skipping paper ${paper.aid}: No DOI found`);
                    failCount++;
                    continue;
                }

                try {
                    const normalizedDoi = paper.doi.trim();
                    const normalizedTitle = paper.title
                        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                        .replace(/\n/g, '')    // Remove newlines
                        .trim();               // Remove leading/trailing spaces

                    const tags = [
                        { name: "App-Name", value: "scivault" },
                        { name: "Content-Type", value: "application/json" },
                        { name: "Version", value: "1.0.3" },
                        { name: "doi", value: normalizedDoi },
                        { name: "title", value: normalizedTitle },
                        { name: "aid", value: paper.aid }
                    ];

                    const paperMetadata = Buffer.from(JSON.stringify(paper));
                    const receipt = await irys.upload(paperMetadata, { tags });

                    console.log(`✅ Uploaded: ${paper.doi} (${receipt.id})`);
                    successCount++;

                } catch (error) {
                    console.error(`❌ Failed: ${paper.doi} - ${error.message}`);
                    failCount++;
                }

                // 每10个显示一次进度统计
                if ((i + 1) % 10 === 0 || i === papers.length - 1) {
                    console.log(`\n📊 Progress Report:`);
                    console.log(`   Success: ${successCount}`);
                    console.log(`   Failed: ${failCount}`);
                    console.log(`   Progress: ${Math.round((i + 1) / papers.length * 100)}%`);
                }
            }

            console.log(`\n✨ Completed chunk_${chunkNum}.json`);
            console.log(`   Final Results:`);
            console.log(`   Total Success: ${successCount}`);
            console.log(`   Total Failed: ${failCount}`);
            console.log(`   Success Rate: ${Math.round(successCount / papers.length * 100)}%`);
        }

        console.log('\n🎉 All specified chunks processed successfully!');

    } catch (error) {
        console.error("❌ Error uploading metadata:", error);
    }
};

uploadMetadata();
