use prost::Message;
use prost_types::compiler::CodeGeneratorRequest;
use std::io::{Read, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = Vec::new();
    std::io::stdin().read_to_end(&mut input)?;
    let request = CodeGeneratorRequest::decode(input.as_slice())?;
    let response = reboot_rust_schema::codegen::generate(request);
    let mut encoded = Vec::new();
    response.encode(&mut encoded)?;
    let mut output = std::io::stdout().lock();
    output.write_all(&encoded)?;
    output.flush()?;
    Ok(())
}
