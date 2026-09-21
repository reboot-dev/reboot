use reboot_rust_schema::CLINIC;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    print!("{}", CLINIC.to_proto()?);
    Ok(())
}
