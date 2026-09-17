#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    codegpt_cli::run().await
}
