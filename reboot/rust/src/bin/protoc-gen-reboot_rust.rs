use prost::Message;
use std::io::{Read, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = Vec::new();
    std::io::stdin().read_to_end(&mut input)?;
    let response = reboot_rust_schema::codegen::generate_from_wire(&input);
    let mut encoded = Vec::new();
    response.encode(&mut encoded)?;
    let mut output = std::io::stdout().lock();
    output.write_all(&encoded)?;
    output.flush()?;
    Ok(())
}
